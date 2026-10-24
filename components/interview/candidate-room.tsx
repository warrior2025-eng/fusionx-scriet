"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Camera, CheckCircle2, ChevronDown, ChevronUp, Clock, Copy, Maximize, Mic, RefreshCw, Smartphone, SwitchCamera, TriangleAlert } from "lucide-react";
import { giveConsent, joinInterview, myInterviewQuestions, myRemoval, phoneCameraLink, roomStillOn } from "@/actions/interview";
import { Checklist } from "@/components/interview/checklist";
import { ReminderBanner } from "@/components/interview/reminder-banner";
import type { DeviceErrorKind, StageControls } from "@/components/interview/livekit-stage";
import { LiveKitStage } from "@/components/interview/livekit-stage-lazy";
import { useIntegrity } from "@/components/interview/use-integrity";
import { countdownText, useServerClock } from "@/components/interview/use-server-clock";
import { Button, LinkButton } from "@/components/ui/button";
import { CutCard } from "@/components/ui/cut-card";
import { DEVICE_KEYS, DEVICE_LABEL, enterFullscreen, exitFullscreen, fullscreenElement, onFullscreenChange, readDevice, type DeviceInfo } from "@/lib/interview/device";
import { DEFAULT_RULES, phoneUserId, type InterviewWindow, type RevealedQuestion } from "@/lib/interview/shared";
import { slotRange, slotTime } from "@/lib/recruitment/slots";
import { joinErrorText } from "@/lib/interview/join-error";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type Open = InterviewWindow;
type Step = "device" | "consent" | "ready" | "room";

// The device, read once in the browser (null while rendering on the server).
const noSubscribe = () => () => {};
let deviceCache: DeviceInfo | null = null;
const deviceSnapshot = () => (deviceCache ??= readDevice());
function useDevice(): DeviceInfo | null {
  return useSyncExternalStore(noSubscribe, deviceSnapshot, () => null);
}

/** In-app browsers (WhatsApp, Instagram, …) cannot be trusted with the camera: open the link in Chrome or Safari. */
function OpenInBrowser() {
  const [copied, setCopied] = useState(false);
  return (
    <CutCard className="h-auto">
      <p className="flex items-center gap-2 font-medium text-ink">
        <TriangleAlert size={18} aria-hidden /> Open this link in Chrome or Safari
      </p>
      <p className="mt-2 text-sm leading-relaxed text-ink/75">
        This page is open inside another app (like WhatsApp or Instagram), which can&rsquo;t use the camera and microphone for the interview. Copy the
        link, then open it in Chrome (Android) or Safari (iPhone), or use the app&rsquo;s &ldquo;Open in browser&rdquo; option.
      </p>
      <Button
        className="mt-5"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(window.location.href);
            setCopied(true);
          } catch {
            window.prompt("Copy this link:", window.location.href);
          }
        }}
      >
        <Copy size={16} aria-hidden /> {copied ? "Link copied" : "Copy link"}
      </Button>
    </CutCard>
  );
}

/** Why the camera or microphone could not start, in words for the device in hand, with the fix. */
export function mediaHelp(kind: DeviceErrorKind | "insecure", device: DeviceInfo | null): string {
  if (kind === "insecure") return "This page must be opened over a secure link (https://fxscriet.com). Open the interview link from your status page.";
  if (kind === "device_in_use")
    return "Your camera or microphone is being used by another app. Close Zoom, Google Meet, Teams, WhatsApp calls or the Camera app (and other browser tabs using the camera), then press Test again.";
  if (kind === "no_device") return "No camera or microphone was found. Connect one (or use a phone), then press Test again.";
  if (kind === "permission_denied") {
    if (device?.ios)
      return 'Camera or microphone access is blocked. On iPhone or iPad: tap "aA" in the address bar → Website Settings → Camera and Microphone → Allow (or Settings → Safari → Camera / Microphone → Allow). Then reload this page.';
    if (device && device.kind !== "laptop")
      return "Camera or microphone access is blocked. In Chrome on Android: tap the lock icon in the address bar → Permissions → allow Camera and Microphone (if they are blocked for Chrome itself: Android Settings → Apps → Chrome → Permissions). Then reload this page.";
    return "Camera or microphone access is blocked. In Chrome or Edge: click the camera icon (or the lock) in the address bar → allow Camera and Microphone → reload this page. On Windows, also check Settings → Privacy → Camera / Microphone.";
  }
  return "The camera or microphone could not start. Close other apps that may use them, then press Test again. If it still fails, restart the browser.";
}

const mediaErrorKind = (e: unknown): DeviceErrorKind => {
  const name = e instanceof Error ? e.name : "";
  return /NotAllowed|Security|Permission/i.test(name)
    ? "permission_denied"
    : /NotReadable|TrackStart|Abort/i.test(name)
      ? "device_in_use"
      : /NotFound|DevicesNotFound|Overconstrained/i.test(name)
        ? "no_device"
        : "other";
};

const store = (key: string, value: string) => {
  try {
    if (value) sessionStorage.setItem(key, value);
    else sessionStorage.removeItem(key);
  } catch {}
};
const stored = (key: string) => {
  try {
    return sessionStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
};

type DeviceLists = { camera: MediaDeviceInfo[]; microphone: MediaDeviceInfo[]; speaker: MediaDeviceInfo[] };

/**
 * Camera and microphone test, before joining. Nothing is recorded or sent.
 * The browser is asked inside the tap (iPhone needs that). The candidate can
 * pick the camera, microphone and (where the browser can) speaker; the room
 * then uses the same ones. "Next" opens only once a camera picture and a
 * microphone sound have both been seen ("Continue without camera" only if the
 * day allows it).
 */
function DeviceCheck({
  allowPhones,
  allowNoCamera,
  checklist,
  onReady,
}: {
  allowPhones: boolean;
  allowNoCamera: boolean;
  checklist?: string | null;
  onReady: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const device = useDevice();
  const [issue, setIssue] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const [cameraOk, setCameraOk] = useState(false);
  const [micOk, setMicOk] = useState(false);
  const [started, setStarted] = useState(false);
  const [lists, setLists] = useState<DeviceLists>({ camera: [], microphone: [], speaker: [] });
  const [picked, setPicked] = useState({ camera: "", microphone: "", speaker: "" });
  const live = useRef<{ stream: MediaStream | null; raf: number; audio: AudioContext | null }>({ stream: null, raf: 0, audio: null });
  const mobile = device ? device.kind !== "laptop" : false;
  const canPickSpeaker = typeof HTMLMediaElement !== "undefined" && "setSinkId" in HTMLMediaElement.prototype;

  const stopAll = useCallback(() => {
    cancelAnimationFrame(live.current.raf);
    live.current.stream?.getTracks().forEach((t) => t.stop());
    void live.current.audio?.close().catch(() => {});
    live.current = { stream: null, raf: 0, audio: null };
  }, []);
  useEffect(() => stopAll, [stopAll]);

  // Called from the tap (a user gesture) and when a device is picked.
  const test = useCallback(
    async (choice?: { camera?: string; microphone?: string }) => {
      stopAll();
      setStarted(true);
      setIssue(null);
      setCameraOk(false);
      setMicOk(false);
      setLevel(0);
      if (!window.isSecureContext) {
        setIssue(mediaHelp("insecure", deviceSnapshot()));
        return;
      }
      // The audio meter is made in the tap too, so Safari lets it run.
      let audio: AudioContext | null = null;
      try {
        audio = new AudioContext();
      } catch {}
      const cam = choice?.camera ?? stored(DEVICE_KEYS.camera);
      const mic = choice?.microphone ?? stored(DEVICE_KEYS.microphone);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: cam ? { deviceId: { exact: cam } } : { facingMode: "user" },
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, ...(mic ? { deviceId: { exact: mic } } : {}) },
        });
        live.current.stream = stream;
        if (video.current) video.current.srcObject = stream;
        const all = await navigator.mediaDevices.enumerateDevices().catch(() => [] as MediaDeviceInfo[]);
        setLists({
          camera: all.filter((d) => d.kind === "videoinput"),
          microphone: all.filter((d) => d.kind === "audioinput"),
          speaker: all.filter((d) => d.kind === "audiooutput"),
        });
        const vt = stream.getVideoTracks()[0];
        const at = stream.getAudioTracks()[0];
        setPicked((p) => ({ ...p, camera: vt?.getSettings().deviceId ?? "", microphone: at?.getSettings().deviceId ?? "" }));
        if (audio && at) {
          live.current.audio = audio;
          void audio.resume().catch(() => {});
          const analyser = audio.createAnalyser();
          analyser.fftSize = 256;
          audio.createMediaStreamSource(stream).connect(analyser);
          const data = new Uint8Array(analyser.frequencyBinCount);
          const tick = () => {
            analyser.getByteFrequencyData(data);
            const v = Math.min(1, data.reduce((x, y) => x + y, 0) / data.length / 60);
            setLevel(v);
            if (v > 0.08) setMicOk(true);
            live.current.raf = requestAnimationFrame(tick);
          };
          tick();
        } else if (at) {
          // No level meter on this browser: a live microphone track has to do.
          setMicOk(at.readyState === "live");
        }
      } catch (e) {
        void audio?.close().catch(() => {});
        setIssue(mediaHelp(mediaErrorKind(e), deviceSnapshot()));
      }
    },
    [stopAll],
  );

  const pick = (kind: "camera" | "microphone" | "speaker", id: string) => {
    setPicked((p) => ({ ...p, [kind]: id }));
    if (kind === "speaker") {
      store(DEVICE_KEYS.speaker, id);
      const el = video.current as (HTMLVideoElement & { setSinkId?: (id: string) => Promise<void> }) | null;
      void el?.setSinkId?.(id).catch(() => {});
      return;
    }
    void test({ [kind]: id });
  };
  const next = () => {
    store(DEVICE_KEYS.camera, picked.camera);
    store(DEVICE_KEYS.microphone, picked.microphone);
    stopAll();
    onReady();
  };

  if (device?.inApp) return <OpenInBrowser />;
  const problem = !device
    ? null
    : !device.media
      ? "This browser can't use a camera here. Please open the link in Chrome or Safari (and update it if it is old)."
      : mobile && !allowPhones
        ? "Please join from a laptop or desktop computer. Your phone is only used as the second camera (you will get a QR code inside)."
        : null;
  if (problem) {
    return (
      <CutCard className="h-auto">
        <p className="flex items-center gap-2 font-medium text-ink">
          <TriangleAlert size={18} aria-hidden /> This device can&rsquo;t be used for the interview
        </p>
        <p className="mt-2 text-sm leading-relaxed text-ink/75">{problem}</p>
      </CutCard>
    );
  }
  const select = (kind: keyof DeviceLists, label: string) =>
    lists[kind].length > 1 && (
      <label className="block text-sm text-ink">
        <span className="mb-1 block text-xs text-ink/70">{label}</span>
        <select value={picked[kind]} onChange={(e) => pick(kind, e.target.value)} className="w-full border border-line bg-paper px-2 py-2 text-sm text-ink">
          {lists[kind].map((d, i) => (
            <option key={d.deviceId || i} value={d.deviceId}>
              {d.label || `${label} ${i + 1}`}
            </option>
          ))}
        </select>
      </label>
    );
  return (
    <div className="space-y-6">
      <CutCard className="h-auto">
        <h2 className="font-serif text-xl text-ink">1. Check your camera and microphone</h2>
        <p className="mt-2 text-sm text-ink/75">
          Your interview takes place here, on the FusionX@SCRIET website (in-website interview room), not on Google Meet.{" "}
          {mobile ? "Use your phone's front camera, on a stand, in a quiet place with good light." : "Use a quiet place with good light."} Nothing is recorded.
        </p>
        {!started ? (
          <Button className="mt-5 w-full sm:w-auto" size="lg" onClick={() => void test()}>
            <Camera size={16} aria-hidden /> Test camera and microphone
          </Button>
        ) : (
          <div className="mt-5 grid gap-5 sm:grid-cols-[1fr_16rem] sm:items-start">
            <video
              ref={video}
              autoPlay
              playsInline
              muted
              onLoadedData={(e) => setCameraOk(e.currentTarget.videoWidth > 0)}
              onResize={(e) => setCameraOk(e.currentTarget.videoWidth > 0)}
              className="aspect-video w-full bg-black object-cover"
              aria-label="Your camera preview"
            />
            <div className="space-y-4 text-sm">
              <p className="flex items-center gap-2 text-ink">
                <Camera size={16} aria-hidden /> Camera: {cameraOk ? "working" : issue ? "not working" : "waiting for a picture…"}
              </p>
              <div>
                <p className="flex items-center gap-2 text-ink">
                  <Mic size={16} aria-hidden /> Microphone: {micOk ? "working" : "say something…"}
                </p>
                <div className="mt-2 h-2 w-full bg-ink/10" role="meter" aria-label="Microphone level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level * 100)}>
                  <div className="h-2 bg-accent transition-[width] duration-100" style={{ width: `${Math.round(level * 100)}%` }} />
                </div>
              </div>
              {select("camera", "Camera")}
              {select("microphone", "Microphone")}
              {canPickSpeaker && select("speaker", "Speaker")}
              {issue && (
                <p role="alert" className="border border-red-500/50 bg-red-500/10 p-3 text-sm leading-relaxed text-ink">
                  {issue}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button className="w-full sm:w-auto" size="lg" disabled={!cameraOk || !micOk} onClick={next}>
                  Next
                </Button>
                <Button variant="secondary" className="w-full sm:w-auto" onClick={() => void test()}>
                  Test again
                </Button>
              </div>
              {(!cameraOk || !micOk) && !issue && <p className="text-xs text-ink/70">Next opens when your camera shows a picture and the microphone hears you.</p>}
              {allowNoCamera && !cameraOk && micOk && (
                <Button variant="ghost" onClick={next}>
                  Continue without camera
                </Button>
              )}
            </div>
          </div>
        )}
      </CutCard>
      <CutCard className="h-auto">
        <Checklist text={checklist} />
      </CutCard>
    </div>
  );
}

/** The plain-language notice of what is monitored, and the "I agree". */
function Consent({ access, mobile, onAgreed }: { access: Open; mobile: boolean; onAgreed: () => void }) {
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <CutCard className="h-auto">
      <h2 className="font-serif text-xl text-ink">2. What the interview room watches</h2>
      <p className="mt-2 text-sm leading-relaxed text-ink/75">
        To keep the interview fair for everyone, FusionX@SCRIET&rsquo;s interview room notices the following and shows it to your interview
        panel. It can&rsquo;t see other apps or your screen, and does not record anything.
      </p>
      <ul className="mt-4 list-disc space-y-1.5 pl-5 text-sm text-ink">
        <li>Your camera and microphone, live to the panel (and to the other candidates in your slot).</li>
        {access.phone_camera !== "off" && !mobile && (
          <li>
            Your phone as a second camera showing your desk and hands
            {access.phone_camera === "required" ? " (required)" : " (if you connect it)"}.
          </li>
        )}
        <li>
          Each time you leave the interview screen (another app or tab, the home screen{mobile ? "" : ", another window or leaving fullscreen"}), and for how
          long. The panel sees it at once.
        </li>
        <li>Copy, paste, cut and right-click: these are blocked, and each try is noted.</li>
        {!mobile && <li>If your computer is using a second screen (on browsers that can tell).</li>}
        <li>When your camera or microphone is turned off, and when you leave or rejoin.</li>
      </ul>
      <p className="mt-4 text-sm text-ink/75">Nothing is recorded: no video, audio, screenshots or typing is stored. Only the list of these events and their times is kept for the panel.</p>
      <label className="mt-5 flex items-start gap-3 text-sm text-ink">
        <input type="checkbox" className="mt-0.5 h-5 w-5 accent-[var(--color-accent)]" checked={agree} onChange={(e) => setAgree(e.target.checked)} />I agree to these rules for my interview.
      </label>
      {error && (
        <p role="alert" className="mt-3 text-sm text-ink">
          {error}
        </p>
      )}
      <Button
        className="mt-5 w-full sm:w-auto"
        size="lg"
        disabled={!agree || busy}
        onClick={async () => {
          setBusy(true);
          const res = await giveConsent(access.booking_id);
          setBusy(false);
          if (res.ok) onAgreed();
          else setError(res.message);
        }}
      >
        I agree and continue
      </Button>
    </CutCard>
  );
}

/** Questions the panel has revealed to this slot: Supabase Realtime, with a 5-second poll behind it. */
function useRevealedQuestions(bookingId: string, slotId: string, active: boolean) {
  const [questions, setQuestions] = useState<RevealedQuestion[]>([]);
  useEffect(() => {
    if (!active) return;
    let stop = false;
    const load = async () => {
      const list = await myInterviewQuestions(bookingId).catch(() => null);
      if (!stop && list) setQuestions(list);
    };
    void load();
    const timer = window.setInterval(load, 5000);
    const supabase = createClient();
    const channel = supabase
      .channel(`reveals-${slotId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "recruitment_question_reveals", filter: `slot_id=eq.${slotId}` }, () => void load())
      .subscribe();
    // The sign-in is kept fresh in the background (no page change while in the room).
    const keepSignedIn = window.setInterval(() => void supabase.auth.getSession().catch(() => null), 4 * 60_000);
    return () => {
      stop = true;
      window.clearInterval(timer);
      window.clearInterval(keepSignedIn);
      void supabase.removeChannel(channel);
    };
  }, [bookingId, slotId, active]);
  return questions;
}

/** Keeps the screen on while in the room (Screen Wake Lock API, where the browser has it). */
function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    type Sentinel = { release: () => Promise<void> };
    const nav = navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<Sentinel> } };
    if (!nav.wakeLock) return;
    let lock: Sentinel | null = null;
    const take = () => {
      if (document.visibilityState !== "visible") return;
      nav.wakeLock
        ?.request("screen")
        .then((l) => {
          lock = l;
        })
        .catch(() => {});
    };
    take();
    document.addEventListener("visibilitychange", take);
    return () => {
      document.removeEventListener("visibilitychange", take);
      void lock?.release().catch(() => {});
    };
  }, [active]);
}

/** The QR code that opens the phone camera page (10 minutes; renewed automatically). */
function PhoneQr({ access, connected }: { access: Open; connected: boolean }) {
  const [link, setLink] = useState<{ url: string; expiresAt: string; qr: { path: string; size: number } } | null>(null);
  const [error, setError] = useState("");
  const make = useCallback(async () => {
    const res = await phoneCameraLink(access.booking_id);
    if (res.ok) {
      setLink(res);
      setError("");
    } else setError(res.message);
  }, [access.booking_id]);
  useEffect(() => {
    if (connected) return;
    const first = window.setTimeout(make, 0);
    const timer = window.setInterval(make, 9 * 60_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [make, connected]);

  if (connected) {
    return (
      <p className="flex items-center gap-2 text-sm text-ink">
        <CheckCircle2 size={16} className="text-accent" aria-hidden /> Phone camera connected
      </p>
    );
  }
  return (
    <div>
      <p className={cn("flex items-center gap-2 text-sm font-medium", access.phone_camera === "required" ? "text-ink" : "text-ink/80")}>
        <Smartphone size={16} aria-hidden />
        {access.phone_camera === "required" ? "Connect your phone camera (required)" : "Connect your phone camera (optional)"}
      </p>
      <p className="mt-1 text-xs text-ink/70">Scan with your phone and place it to show your desk and hands. It joins muted, camera only.</p>
      {link && (
        <svg viewBox={`0 0 ${link.qr.size} ${link.qr.size}`} className="mt-3 h-40 w-40 bg-white p-1" role="img" aria-label="QR code for the phone camera" data-url={link.url}>
          <path d={link.qr.path} fill="#00030d" />
        </svg>
      )}
      {error && <p className="mt-2 text-xs text-ink">{error}</p>}
    </div>
  );
}

const ORDINAL = (n: number) => (n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`);

/**
 * The FusionX Interview Room for a candidate: device check → consent → the
 * call (LiveKit), in fullscreen when the day asks for it and the device can,
 * with the revealed questions and (on a laptop) the phone-camera QR beside it.
 * Works on laptops, tablets and phones; in-app browsers are asked to open the
 * link in Chrome or Safari.
 *
 * The day has one room; a candidate is in it for their own slot only. Opened
 * early on the day, the page waits ("Waiting room", with a countdown) and
 * connects by itself when the slot's join time comes. When the slot ends
 * (by the database's clock) the call closes and cannot be joined again; the
 * server also removes anyone still connected.
 *
 * Leaving the interview screen is shown to the panel at once; the candidate
 * is warned when they come back, and the day may remove them after a limit.
 */
export function CandidateRoom({ access }: { access: Open & { state?: string } }) {
  const rules = access.rules ?? DEFAULT_RULES;
  const device = useDevice();
  const mobile = device ? device.kind !== "laptop" : false;
  // Fullscreen only where the device has it (not on iPhone): elsewhere the lock-in is skipped, not the candidate.
  const strictFs = access.strict_fullscreen && device?.fullscreen !== false;
  const [step, setStep] = useState<Step>(access.consented_at ? "ready" : "device");
  const [error, setError] = useState("");
  const [joining, setJoining] = useState(false);
  const [fullscreen, setFullscreen] = useState(true);
  const [phoneConnected, setPhoneConnected] = useState(false);
  const [moved, setMoved] = useState(false);
  const [ended, setEnded] = useState(false);
  const [removed, setRemoved] = useState<"left_screen" | "panel" | null>(null);
  const [warning, setWarning] = useState<{ seconds: number; times: number } | null>(null);
  const [sheetOpen, setSheetOpen] = useState(true);
  // Camera / microphone inside the call: the controls, a problem to show, the panel's "please re-check" request.
  const [controls, setControls] = useState<StageControls | null>(null);
  const [mediaIssue, setMediaIssue] = useState<{ kind: DeviceErrorKind; device: "camera" | "microphone" } | null>(null);
  const [recheck, setRecheck] = useState(false);
  const [fixing, setFixing] = useState(false);
  const endedRef = useRef(false);
  const shell = useRef<HTMLDivElement>(null);
  // The call: its server and token while connected (null = not in the call).
  const [conn, setConn] = useState<{ serverUrl: string; token: string } | null>(null);
  const joinedOnce = useRef(false);
  const deviceLogged = useRef(false);
  const phoneId = phoneUserId(access.booking_id);
  const inRoom = step === "room";
  const usePhoneCamera = access.phone_camera !== "off" && !mobile;

  const onFullscreenExit = useCallback(() => setFullscreen(false), []);
  const onReturn = useCallback((seconds: number, times: number) => setWarning({ seconds, times }), []);
  const onRemoved = useCallback((reason: "left_screen" | "panel") => {
    endedRef.current = true;
    setRemoved(reason);
    setConn(null);
    exitFullscreen();
  }, []);
  const { record } = useIntegrity(access.booking_id, inRoom && !removed, {
    strictFullscreen: strictFs,
    onFullscreenExit,
    onReturn: rules.warn_on_leave ? onReturn : undefined,
    onRemoved,
  });
  const questions = useRevealedQuestions(access.booking_id, access.slot_id, inRoom);
  useWakeLock(inRoom && !removed);

  const { now, tick } = useServerClock(access.now);
  const opensAt = new Date(access.opens_at).getTime();
  const startsAt = new Date(access.starts_at).getTime();
  const closesAt = new Date(access.closes_at).getTime();
  const waiting = tick === null ? access.state === "too_early" : tick < opensAt;
  // Let in early (when the day allows it): camera and microphone stay off, and nobody is seen or heard, until the slot starts.
  const hold = tick !== null && tick < startsAt;

  // The slot is over: leave the call, say thank you, no way back in (the server refuses a new token too).
  useEffect(() => {
    const timer = window.setTimeout(
      () => {
        endedRef.current = true;
        setEnded(true);
        setConn(null);
        exitFullscreen();
      },
      Math.max(closesAt - now(), 0) + 500,
    );
    return () => window.clearTimeout(timer);
  }, [closesAt, now]);

  useEffect(() => onFullscreenChange(() => setFullscreen(Boolean(fullscreenElement()))), []);

  // The panel can switch the day back to Google Meet at any time: leave the call and say where to go.
  useEffect(() => {
    if (!inRoom || moved) return;
    const timer = window.setInterval(async () => {
      if (await roomStillOn(access.booking_id).catch(() => true)) return;
      setConn(null);
      setMoved(true);
      exitFullscreen();
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [inRoom, moved, access.booking_id]);

  const join = useCallback(
    async (auto = false) => {
      setJoining(true);
      setError("");
      // Fullscreen needs a tap; when the waiting room connects by itself, the "Return to fullscreen" screen asks for it.
      if (strictFs && !auto) await enterFullscreen(shell.current);
      // The camera and microphone are asked for inside the tap (iPhone needs that); the room then opens them again.
      if (!auto) {
        try {
          const warm = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
          warm.getTracks().forEach((t) => t.stop());
        } catch {
          // The room reports it with the right help.
        }
      }
      let res = await joinInterview(access.booking_id);
      // A device clock a few seconds fast: the server says "not yet"; try again shortly.
      for (let i = 0; auto && !res.ok && /room opens at/i.test(res.message) && i < 5; i++) {
        await new Promise((r) => window.setTimeout(r, 3000));
        res = await joinInterview(access.booking_id);
      }
      setJoining(false);
      if (!res.ok) {
        if (/removed/i.test(res.message)) {
          setRemoved(/panel/i.test(res.message) ? "panel" : "left_screen");
          return;
        }
        setError(res.message);
        return;
      }
      if (endedRef.current) return;
      setConn({ serverUrl: res.serverUrl, token: res.token });
      setStep("room");
      setFullscreen(Boolean(fullscreenElement()));
    },
    [access.booking_id, strictFs],
  );

  // Waiting room: connect by itself at the slot's join time.
  useEffect(() => {
    if (step !== "ready") return;
    const ms = opensAt - now();
    if (ms <= 0) return;
    const timer = window.setTimeout(() => void join(true), ms + 300);
    return () => window.clearTimeout(timer);
  }, [step, opensAt, now, join]);

  // Call events → integrity events (the room's own signals).
  const onConnected = useCallback(() => {
    if (joinedOnce.current) record("rejoined");
    joinedOnce.current = true;
    setError("");
    if (!deviceLogged.current) {
      deviceLogged.current = true;
      const d = deviceSnapshot();
      record("device_info", { device: DEVICE_LABEL[d.kind], browser: d.browser, fullscreen: d.fullscreen, phone_camera: !mobile });
      if (access.strict_fullscreen && !d.fullscreen) record("fullscreen_unsupported");
    }
  }, [record, mobile, access.strict_fullscreen]);
  const onReconnected = useCallback(() => record("reconnect"), [record]);
  const onDisconnected = useCallback(
    (wasRemoved: boolean) => {
      setConn(null);
      // Removed by the server (slot over, removed for leaving the screen or by the panel, or the day moved to Google Meet),
      // or closed by the timer: not "left".
      if (wasRemoved || endedRef.current) {
        exitFullscreen();
        if (endedRef.current) {
          setEnded(true);
          return;
        }
        void (async () => {
          const why = await myRemoval(access.booking_id).catch(() => null);
          if (why) return onRemoved(why);
          const on = await roomStillOn(access.booking_id).catch(() => true);
          if (on) {
            endedRef.current = true;
            setEnded(true);
          } else setMoved(true);
        })();
        return;
      }
      record("left_room");
    },
    [record, access.booking_id, onRemoved],
  );
  const onCallError = useCallback((message: string) => {
    setError(joinErrorText(message, "candidate"));
  }, []);
  const onPeople = useCallback((ids: string[]) => setPhoneConnected(ids.includes(phoneId)), [phoneId]);
  const onJoined = useCallback((id: string) => id === phoneId && record("phone_camera_joined"), [phoneId, record]);
  const onLeft = useCallback((id: string) => id === phoneId && record("phone_camera_left"), [phoneId, record]);
  const onLocalOff = useCallback((kind: "camera" | "microphone") => record(kind === "camera" ? "camera_off" : "mic_off"), [record]);
  const onDeviceError = useCallback(
    (kind: DeviceErrorKind, which: "camera" | "microphone") => {
      setMediaIssue({ kind, device: which });
      record("device_error", { kind, device: which });
    },
    [record],
  );
  const onMessage = useCallback((message: string) => {
    if (message === "recheck") setRecheck(true);
  }, []);
  const fixDevices = async () => {
    if (!controls) return;
    setFixing(true);
    const ok = await controls.fix();
    setFixing(false);
    record("devices_fixed", { ok });
    if (ok) {
      setMediaIssue(null);
      setRecheck(false);
    }
  };
  const rejoin = async () => {
    setError("");
    const res = await joinInterview(access.booking_id);
    if (res.ok) setConn({ serverUrl: res.serverUrl, token: res.token });
    else if (/removed/i.test(res.message)) setRemoved(/panel/i.test(res.message) ? "panel" : "left_screen");
    else setError(res.message);
  };

  if (removed) {
    return (
      <CutCard className="h-auto">
        <h2 className="font-serif text-xl text-ink">
          {removed === "left_screen" ? "You were removed for leaving the interview screen" : "The panel removed you from this interview"}
        </h2>
        <p className="mt-2 text-sm text-ink/75">You can&rsquo;t rejoin this slot. The panel has been told and will decide on your application.</p>
        <LinkButton href="/recruitment/status" variant="secondary" size="sm" className="mt-5">
          Go to your status page
        </LinkButton>
      </CutCard>
    );
  }

  return (
    <div ref={shell} className={cn(inRoom && "bg-paper", inRoom && "fixed inset-0 z-50 flex flex-col")}>
      {!inRoom && (
        <div className="space-y-6">
          {step === "device" && (
            <DeviceCheck allowPhones={rules.allow_phones} allowNoCamera={Boolean(rules.allow_no_camera)} checklist={rules.checklist} onReady={() => setStep("consent")} />
          )}
          {step === "consent" && <Consent access={access} mobile={mobile} onAgreed={() => setStep("ready")} />}
          {step === "ready" && ended && (
            <CutCard className="h-auto">
              <h2 className="font-serif text-xl text-ink">Your interview slot has ended</h2>
              <p className="mt-2 text-sm text-ink/75">The interview room for your slot has closed. Missed interviews cannot be rescheduled.</p>
              <LinkButton href="/recruitment/status" variant="secondary" size="sm" className="mt-5">
                Go to your status page
              </LinkButton>
            </CutCard>
          )}
          {step === "ready" && !ended && waiting && (
            <>
              <ReminderBanner startsAt={access.starts_at} serverNow={access.now} minutes={rules.reminder_minutes ?? 5} />
              <CutCard className="h-auto">
                <h2 className="flex items-center gap-2 font-serif text-xl text-ink">
                  <Clock size={18} aria-hidden /> Waiting room
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-ink/75">
                  Your slot: {slotRange(access.starts_at, access.ends_at)} IST. You will be connected to the interview room by itself at{" "}
                  {slotTime(access.opens_at)}. Keep this page open
                  {strictFs ? "; the interview then runs in fullscreen" : ""}.
                </p>
                {tick !== null && (
                  <p className="mt-5 font-serif text-4xl tabular-nums text-ink" role="timer" aria-live="off">
                    {countdownText(opensAt - tick)}
                  </p>
                )}
                {usePhoneCamera && (
                  <div className="mt-6 border-t border-line pt-5">
                    {tick !== null && tick >= opensAt - 30 * 60_000 ? (
                      <PhoneQr access={access} connected={false} />
                    ) : (
                      <p className="flex items-center gap-2 text-sm text-ink/75">
                        <Smartphone size={16} aria-hidden /> The QR code for your phone camera appears here 30 minutes before your slot.
                      </p>
                    )}
                  </div>
                )}
                {error && (
                  <p role="alert" className="mt-3 text-sm text-ink">
                    {error}
                  </p>
                )}
              </CutCard>
              <CutCard className="h-auto">
                <Checklist text={rules.checklist} />
              </CutCard>
            </>
          )}
          {step === "ready" && !ended && !waiting && (
            <CutCard className="h-auto">
              <h2 className="font-serif text-xl text-ink">3. Join your interview</h2>
              <p className="mt-2 text-sm text-ink/75">
                Your slot: {slotRange(access.starts_at, access.ends_at)} IST.
                {strictFs ? " The interview opens in fullscreen; stay in fullscreen until it ends." : ""} Don&rsquo;t leave this screen until it ends.
              </p>
              {error && (
                <p role="alert" className="mt-3 text-sm text-ink">
                  {error}
                </p>
              )}
              <Button className="mt-5 w-full sm:w-auto" size="lg" disabled={joining} onClick={() => void join()}>
                <Maximize size={16} aria-hidden /> {joining ? "Opening the room…" : "Join the interview room"}
              </Button>
            </CutCard>
          )}
        </div>
      )}

      {inRoom && (
        <div className="relative flex min-h-0 flex-1 flex-col lg:flex-row">
          {warning && (
            <div role="alert" className="absolute inset-x-2 top-2 z-30 flex items-start justify-between gap-3 border border-red-500/60 bg-paper p-3 text-sm text-ink shadow-lg sm:inset-x-auto sm:left-1/2 sm:w-[32rem] sm:-translate-x-1/2">
              <p>
                <span className="font-semibold">Leaving the interview screen is recorded and shown to the panel.</span>{" "}
                <span className="text-ink/75">
                  You were away {warning.seconds} s ({ORDINAL(warning.times)} time).
                </span>
              </p>
              <button type="button" className="shrink-0 border border-ink/30 px-3 py-1 font-medium" onClick={() => setWarning(null)}>
                OK
              </button>
            </div>
          )}
          {(mediaIssue || recheck) && conn && (
            <div role="alert" className="absolute inset-x-2 top-16 z-30 border border-amber-500/70 bg-paper p-3 text-sm text-ink shadow-lg sm:inset-x-auto sm:left-1/2 sm:w-[34rem] sm:-translate-x-1/2">
              <p className="font-semibold">{recheck && !mediaIssue ? "The panel asks you to check your camera and microphone." : `Your ${mediaIssue?.device ?? "camera"} is not working.`}</p>
              {mediaIssue && <p className="mt-1 leading-relaxed text-ink/80">{mediaHelp(mediaIssue.kind, device)}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" disabled={fixing || !controls} onClick={() => void fixDevices()}>
                  <RefreshCw size={14} aria-hidden /> {fixing ? "Fixing…" : "Fix audio/video"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setMediaIssue(null);
                    setRecheck(false);
                  }}
                >
                  Close
                </Button>
              </div>
            </div>
          )}
          {conn && controls && (
            <div className="absolute left-2 top-2 z-20 flex gap-2">
              <button
                type="button"
                onClick={() => void fixDevices()}
                disabled={fixing}
                className="inline-flex items-center gap-1.5 rounded bg-black/70 px-3 py-2 text-xs font-medium text-white hover:bg-black/85"
                title="Turn camera and microphone off and on again, and unblock sound"
              >
                <RefreshCw size={14} aria-hidden /> {fixing ? "Fixing…" : "Fix audio/video"}
              </button>
              {mobile && (
                <button
                  type="button"
                  onClick={() => void controls.flip()}
                  className="inline-flex items-center gap-1.5 rounded bg-black/70 px-3 py-2 text-xs font-medium text-white hover:bg-black/85"
                >
                  <SwitchCamera size={14} aria-hidden /> Switch camera
                </button>
              )}
            </div>
          )}
          <div data-interview-frame className="relative min-h-0 flex-1 bg-black">
            {conn ? (
              <LiveKitStage
                serverUrl={conn.serverUrl}
                token={conn.token}
                mode="candidate"
                hold={hold}
                small={mobile}
                onConnected={onConnected}
                onDisconnected={onDisconnected}
                onError={onCallError}
                onPeople={onPeople}
                onJoined={onJoined}
                onLeft={onLeft}
                onLocalOff={onLocalOff}
                onReconnected={onReconnected}
                onDeviceError={onDeviceError}
                onControls={setControls}
                onMessage={onMessage}
              />
            ) : (
              !moved &&
              !ended && (
                <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
                  <p className="text-sm text-white/85">You are not in the call.</p>
                  <Button size="lg" onClick={rejoin}>
                    Rejoin the call
                  </Button>
                </div>
              )
            )}
          </div>
          {/* On a phone: a bottom sheet that can be folded down; on a laptop: a sidebar. */}
          <aside
            className={cn(
              "w-full shrink-0 overflow-y-auto border-t border-line bg-surface lg:max-h-none lg:w-96 lg:border-l lg:border-t-0 lg:p-5",
              sheetOpen ? "max-h-[42vh] p-4" : "max-h-14 px-4 py-2",
            )}
            aria-label="Interview questions"
          >
            <button type="button" className="flex w-full items-center justify-between gap-2 py-1 text-left lg:hidden" onClick={() => setSheetOpen((o) => !o)} aria-expanded={sheetOpen}>
              <span className="text-sm font-semibold text-ink">
                Questions ({questions.length})
                {tick !== null && !ended && <span className="ml-2 font-normal tabular-nums text-ink/75">{hold ? `starts in ${countdownText(startsAt - tick)}` : `ends in ${countdownText(closesAt - tick)}`}</span>}
              </span>
              {sheetOpen ? <ChevronDown size={18} aria-hidden /> : <ChevronUp size={18} aria-hidden />}
            </button>
            <div className={cn(!sheetOpen && "hidden lg:block")}>
              <p className="hidden text-xs text-ink/70 lg:block">FusionX@SCRIET interview room · {slotRange(access.starts_at, access.ends_at)} IST</p>
              {tick !== null && !ended && (
                <p className="mt-2 hidden text-sm tabular-nums text-ink lg:block" role="timer" aria-live="off">
                  {hold ? `Your slot starts in ${countdownText(startsAt - tick)}. Camera and microphone turn on then.` : `Your slot ends in ${countdownText(closesAt - tick)}`}
                </p>
              )}
              <h2 className="mt-2 hidden font-serif text-lg text-ink lg:mt-4 lg:block">Questions</h2>
              {questions.length === 0 ? (
                <p className="mt-2 text-sm text-ink/70">The panel will show questions here during the interview.</p>
              ) : (
                <ol className="mt-3 space-y-3" aria-live="polite">
                  {questions.map((q, i) => (
                    <li key={q.id} className="border border-line p-3 text-sm text-ink">
                      <span className="mb-1 block text-xs text-ink/65">
                        Question {i + 1} · {q.hub}
                      </span>
                      <span className="whitespace-pre-line select-none">{q.body}</span>
                    </li>
                  ))}
                </ol>
              )}
              {usePhoneCamera && (
                <div className="mt-6 border-t border-line pt-5">
                  <PhoneQr access={access} connected={phoneConnected} />
                </div>
              )}
              {error && (
                <p role="alert" className="mt-4 text-sm text-ink">
                  {error}
                </p>
              )}
            </div>
          </aside>

          {moved && (
            <div className="absolute inset-0 z-40 flex items-center justify-center bg-paper p-6" role="alertdialog" aria-modal="true" aria-labelledby="moved-title">
              <div className="max-w-md text-center">
                <h2 id="moved-title" className="font-serif text-2xl text-ink">
                  Your interview has moved to Google Meet
                </h2>
                <p className="mt-3 text-sm text-ink/75">The panel has switched today&rsquo;s interviews to Google Meet. Open your status page for the Meet link.</p>
                <LinkButton href="/recruitment/status" className="mt-5">
                  Go to your status page
                </LinkButton>
              </div>
            </div>
          )}

          {ended && !moved && (
            <div className="absolute inset-0 z-40 flex items-center justify-center bg-paper p-6" role="alertdialog" aria-modal="true" aria-labelledby="ended-title">
              <div className="max-w-md text-center">
                <h2 id="ended-title" className="font-serif text-2xl text-ink">
                  Your interview slot has ended. Thank you!
                </h2>
                <p className="mt-3 text-sm text-ink/75">The panel will share the results on your status page.</p>
                <LinkButton href="/recruitment/status" className="mt-5">
                  Go to your status page
                </LinkButton>
              </div>
            </div>
          )}

          {strictFs && !fullscreen && !moved && !ended && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-paper/95 p-6" role="dialog" aria-modal="true" aria-labelledby="fs-title">
              <div className="max-w-md text-center">
                <h2 id="fs-title" className="font-serif text-2xl text-ink">
                  Return to fullscreen
                </h2>
                <p className="mt-3 text-sm text-ink/75">The interview runs in fullscreen. Each time it is left, the panel is told.</p>
                <Button className="mt-5" size="lg" onClick={() => void enterFullscreen(shell.current)}>
                  <Maximize size={16} aria-hidden /> Return to fullscreen
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
