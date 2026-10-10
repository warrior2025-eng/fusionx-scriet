"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Camera, CameraOff, CircleAlert, CircleCheck, CircleX, Search, Undo2, Volume2, VolumeX } from "lucide-react";
import { checkInByToken, loadRoster, setAttendance, type RosterEntry, type ScanResult } from "@/actions/check-in";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { istTime } from "@/lib/events/format";
import { cn } from "@/lib/utils";

type Detector = { detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]> };
declare global {
  interface Window {
    BarcodeDetector?: {
      new (options: { formats: string[] }): Detector;
      getSupportedFormats?: () => Promise<string[]>;
    };
  }
}

/** A ticket's code is 64 hexadecimal characters; anything else is some other QR code. */
const TICKET = /^[0-9a-f]{64}$/;

type Banner = { tone: "ok" | "warn" | "bad"; title: string; detail?: string };

function describe(scan: ScanResult): Banner {
  switch (scan.result) {
    case "ok":
      return { tone: "ok", title: `Checked in: ${scan.name}` };
    case "already":
      return { tone: "warn", title: `Already checked in${scan.at ? ` at ${istTime(scan.at)}` : ""}`, detail: scan.name };
    case "cancelled":
      return { tone: "bad", title: "Registration cancelled", detail: scan.name };
    case "waitlisted":
      return { tone: "bad", title: "On the waitlist, not registered", detail: scan.name };
    case "slow_down":
      return { tone: "bad", title: "Too many failed scans", detail: "Wait a minute, then try again." };
    case "forbidden":
      return { tone: "bad", title: "You can't check people in for this event" };
    case "invalid":
      return { tone: "bad", title: "Not a valid ticket for this event" };
    default:
      return { tone: "bad", title: "Something went wrong", detail: "Check your connection and scan again." };
  }
}

const TONE = {
  ok: { box: "border-green-600 bg-green-600/15", Icon: CircleCheck, icon: "text-green-600" },
  warn: { box: "border-amber-500 bg-amber-500/15", Icon: CircleAlert, icon: "text-amber-500" },
  bad: { box: "border-red-600 bg-red-600/15", Icon: CircleX, icon: "text-red-600" },
} as const;

/**
 * The check-in screen: camera scanner, a result banner (announced to screen
 * readers), a live counter and a manual list with search and undo.
 *
 * Scanning uses the browser's own BarcodeDetector where it exists (Android
 * Chrome). Elsewhere (iPhone Safari, Firefox, desktop) a small decoder,
 * jsQR, is loaded on demand and reads frames from the camera instead.
 */
export function CheckInClient({
  eventId,
  initialRoster,
  canUndo,
}: {
  eventId: string;
  initialRoster: RosterEntry[];
  canUndo: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const busyRef = useRef(false);
  const lastRef = useRef({ value: "", at: 0 });
  const audioRef = useRef<AudioContext | null>(null);

  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [feedback, setFeedback] = useState(true);
  const [roster, setRoster] = useState(initialRoster);
  const [query, setQuery] = useState("");
  const [rowError, setRowError] = useState<string | null>(null);
  const [pendingRow, setPendingRow] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const refresh = useCallback(async () => {
    const next = await loadRoster(eventId);
    if (next) setRoster(next);
  }, [eventId]);

  // Other volunteers are checking people in too: keep the list and counter fresh.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!document.hidden) void refresh();
    }, 15000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const signal = useCallback(
    (tone: Banner["tone"]) => {
      if (!feedback) return;
      navigator.vibrate?.(tone === "ok" ? 80 : [60, 60, 60]);
      try {
        const ctx = (audioRef.current ??= new AudioContext());
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = tone === "ok" ? 880 : tone === "warn" ? 520 : 220;
        gain.gain.value = 0.08;
        osc.connect(gain).connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + (tone === "ok" ? 0.12 : 0.3));
      } catch {
        // Sound is a nicety; the banner is what matters.
      }
    },
    [feedback],
  );

  const handle = useCallback(
    async (raw: string) => {
      const value = raw.trim().toLowerCase();
      const now = Date.now();
      // The camera sees the same code many times a second.
      if (busyRef.current || (value === lastRef.current.value && now - lastRef.current.at < 4000)) return;
      lastRef.current = { value, at: now };
      busyRef.current = true;
      try {
        const scan: ScanResult = TICKET.test(value) ? await checkInByToken(eventId, value) : { result: "invalid" };
        const next = describe(scan);
        setBanner(next);
        signal(next.tone);
        if (scan.result === "ok") void refresh();
      } finally {
        busyRef.current = false;
      }
    },
    [eventId, refresh, signal],
  );

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setScanning(false);
  }, []);

  async function start() {
    setCameraError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("This browser can't use the camera here. Use the list below to check people in.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      setScanning(true);
    } catch {
      setCameraError("The camera couldn't be opened. Allow camera access for this site, or use the list below.");
    }
  }

  // The scan loop, running while the camera is on.
  useEffect(() => {
    if (!scanning) return;
    const video = videoRef.current;
    if (!video) return;
    let cancelled = false;
    let timer = 0;

    (async () => {
      let detector: Detector | null = null;
      try {
        const formats = (await window.BarcodeDetector?.getSupportedFormats?.()) ?? [];
        if (window.BarcodeDetector && formats.includes("qr_code")) {
          detector = new window.BarcodeDetector({ formats: ["qr_code"] });
        }
      } catch {
        detector = null;
      }

      const jsQR = detector ? null : (await import("jsqr")).default;
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true });

      const tick = async () => {
        if (cancelled) return;
        if (!document.hidden && video.readyState >= 2 && video.videoWidth > 0) {
          try {
            if (detector) {
              const codes = await detector.detect(video);
              if (codes[0]?.rawValue) void handle(codes[0].rawValue);
            } else if (jsQR && ctx) {
              // Decode a downscaled frame: enough for a ticket, light on the phone.
              const scale = Math.min(1, 640 / video.videoWidth);
              canvas.width = Math.round(video.videoWidth * scale);
              canvas.height = Math.round(video.videoHeight * scale);
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const code = jsQR(frame.data, frame.width, frame.height, { inversionAttempts: "dontInvert" });
              if (code?.data) void handle(code.data);
            }
          } catch {
            // A frame that could not be read; the next one will be.
          }
        }
        timer = window.setTimeout(tick, detector ? 150 : 220);
      };
      void tick();
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [scanning, handle]);

  useEffect(() => stop, [stop]);

  const attended = roster.filter((r) => r.status === "attended").length;
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? roster.filter((r) => `${r.full_name} ${r.department ?? ""} ${r.year ?? ""}`.toLowerCase().includes(q)) : roster;
  }, [roster, query]);

  function toggle(entry: RosterEntry, makeAttended: boolean) {
    setRowError(null);
    setPendingRow(entry.id);
    startTransition(async () => {
      const error = await setAttendance(eventId, entry.id, makeAttended);
      setPendingRow(null);
      if (error) {
        setRowError(error);
        return;
      }
      setBanner(
        makeAttended
          ? { tone: "ok", title: `Checked in: ${entry.full_name}`, detail: "Marked by hand" }
          : { tone: "warn", title: `Check-in undone: ${entry.full_name}` },
      );
      await refresh();
    });
  }

  const tone = banner ? TONE[banner.tone] : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink/75" aria-live="polite">
          <span className="font-serif text-3xl tabular-nums text-ink">{attended}</span>
          <span className="tabular-nums"> / {roster.length}</span> checked in
        </p>
        <button
          type="button"
          onClick={() => setFeedback((on) => !on)}
          aria-pressed={feedback}
          className="inline-flex items-center gap-2 rounded-sm border border-ink/30 px-3 py-2 text-sm text-ink hover:border-ink"
        >
          {feedback ? <Volume2 size={16} aria-hidden /> : <VolumeX size={16} aria-hidden />}
          Sound and vibration {feedback ? "on" : "off"}
        </button>
      </div>

      {/* Announced as soon as it changes, for people who can't see the colour. */}
      <div role="status" aria-live="assertive" className="min-h-[5.5rem]">
        {banner && tone ? (
          <div className={cn("flex items-start gap-3 border-2 p-4", tone.box)}>
            <tone.Icon size={30} className={cn("mt-0.5 shrink-0", tone.icon)} aria-hidden />
            <div>
              <p className="text-lg font-semibold leading-snug text-ink">{banner.title}</p>
              {banner.detail && <p className="text-sm text-ink/80">{banner.detail}</p>}
            </div>
          </div>
        ) : (
          <p className="border border-dashed border-ink/25 p-4 text-sm text-ink/65">
            Start the camera and point it at a ticket&rsquo;s QR code. The result appears here.
          </p>
        )}
      </div>

      <div>
        <div className={cn("relative overflow-hidden border border-line bg-black", scanning ? "aspect-square sm:aspect-video" : "hidden")}>
          <video ref={videoRef} muted playsInline className="h-full w-full object-cover" />
          <div className="pointer-events-none absolute inset-[14%] border-2 border-white/80" aria-hidden />
        </div>
        <div className="mt-3 flex flex-wrap gap-3">
          {scanning ? (
            <Button type="button" variant="secondary" size="md" onClick={stop}>
              <CameraOff size={16} /> Stop camera
            </Button>
          ) : (
            <Button type="button" size="lg" onClick={start}>
              <Camera size={18} /> Start camera
            </Button>
          )}
        </div>
        {cameraError && (
          <p role="alert" className="mt-3 text-sm text-red-600">
            {cameraError}
          </p>
        )}
      </div>

      <section aria-labelledby="roster-heading">
        <h2 id="roster-heading" className="font-serif text-xl text-ink">
          Check in by name
        </h2>
        <div className="relative mt-3">
          <Search size={15} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/45" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, department or year"
            aria-label="Search registrants"
            className="pl-9"
          />
        </div>
        {rowError && (
          <p role="alert" className="mt-3 text-sm text-red-600">
            {rowError}
          </p>
        )}
        <ul className="mt-3 divide-y divide-line border border-line bg-surface">
          {shown.length === 0 && (
            <li className="px-4 py-8 text-center text-sm text-ink/60">
              {roster.length === 0 ? "Nobody is registered for this event yet." : "No one matches that search."}
            </li>
          )}
          {shown.map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="font-medium text-ink">{entry.full_name}</p>
                <p className="text-xs text-ink/65">
                  {[
                    entry.department,
                    entry.year,
                    entry.status === "attended" && entry.checked_in_at ? `checked in at ${istTime(entry.checked_in_at)}` : null,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                </p>
              </div>
              {entry.status === "attended" ? (
                canUndo ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    loading={pendingRow === entry.id}
                    onClick={() => toggle(entry, false)}
                  >
                    <Undo2 size={14} /> Undo
                  </Button>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-sm text-ink/75">
                    <CircleCheck size={16} className="text-green-600" aria-hidden /> Checked in
                  </span>
                )
              ) : (
                <Button type="button" size="sm" loading={pendingRow === entry.id} onClick={() => toggle(entry, true)}>
                  Check in
                </Button>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
