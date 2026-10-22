"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Camera, CheckCircle2, Maximize, Mic, Smartphone, TriangleAlert } from "lucide-react";
import type { DailyCall, DailyParticipant } from "@daily-co/daily-js";
import { giveConsent, joinInterview, myInterviewQuestions, phoneCameraLink, roomStillOn } from "@/actions/interview";
import { useIntegrity } from "@/components/interview/use-integrity";
import { Button, LinkButton } from "@/components/ui/button";
import { CutCard } from "@/components/ui/cut-card";
import { phoneUserId, type InterviewWindow, type RevealedQuestion } from "@/lib/interview/shared";
import { slotRange } from "@/lib/recruitment/slots";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type Open = InterviewWindow;
type Step = "device" | "consent" | "ready" | "room";

/** Laptop or desktop Chrome / Edge only: what the room is tested on, and where the integrity signals work. */
function deviceProblem(): string | null {
  const ua = navigator.userAgent;
  const data = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData;
  const mobile = data?.mobile ?? /Android|iPhone|iPad|iPod|Mobi/i.test(ua);
  if (mobile) return "Please join from a laptop or desktop computer. Your phone is only used as the second camera (you will get a QR code inside).";
  const chromium = /Chrome\/\d+/.test(ua) && !/OPR\/|SamsungBrowser|YaBrowser/.test(ua);
  if (!chromium) return "Please open this page in Google Chrome or Microsoft Edge on your laptop or desktop.";
  if (!navigator.mediaDevices?.getUserMedia) return "This browser cannot use a camera here. Please update Chrome or Edge.";
  return null;
}

/** Camera and microphone test, before joining. Nothing is recorded or sent. */
const noSubscribe = () => () => {};

function DeviceCheck({ onReady }: { onReady: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  // Read from the browser once it is there (null while rendering on the server).
  const deviceIssue = useSyncExternalStore(noSubscribe, deviceProblem, () => null);
  const [permissionIssue, setPermissionIssue] = useState<string | null>(null);
  const problem = deviceIssue ?? permissionIssue;
  const [level, setLevel] = useState(0);
  const [cameraOk, setCameraOk] = useState(false);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (!started) return;
    let stream: MediaStream | null = null;
    let raf = 0;
    let audio: AudioContext | null = null;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (video.current) video.current.srcObject = stream;
        setCameraOk(stream.getVideoTracks().length > 0);
        audio = new AudioContext();
        const analyser = audio.createAnalyser();
        analyser.fftSize = 256;
        audio.createMediaStreamSource(stream).connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          analyser.getByteFrequencyData(data);
          setLevel(Math.min(1, data.reduce((a, b) => a + b, 0) / data.length / 60));
          raf = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        setPermissionIssue("Please allow the camera and microphone for this site (the camera icon in the address bar), then try again.");
      }
    })();
    return () => {
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      void audio?.close();
    };
  }, [started]);

  if (problem && !started) {
    return (
      <CutCard className="h-auto">
        <p className="flex items-center gap-2 font-medium text-ink">
          <TriangleAlert size={18} aria-hidden /> This device can&rsquo;t be used for the interview
        </p>
        <p className="mt-2 text-sm leading-relaxed text-ink/75">{problem}</p>
      </CutCard>
    );
  }
  return (
    <CutCard className="h-auto">
      <h2 className="font-serif text-xl text-ink">1. Check your camera and microphone</h2>
      <p className="mt-2 text-sm text-ink/75">Use a laptop or desktop with Chrome or Edge, in a quiet place with good light. Nothing is recorded.</p>
      {!started ? (
        <Button className="mt-5" onClick={() => setStarted(true)}>
          <Camera size={16} aria-hidden /> Test camera and microphone
        </Button>
      ) : (
        <div className="mt-5 grid gap-5 sm:grid-cols-[1fr_14rem] sm:items-start">
          <video ref={video} autoPlay playsInline muted className="aspect-video w-full bg-black object-cover" aria-label="Your camera preview" />
          <div className="space-y-4 text-sm">
            <p className="flex items-center gap-2 text-ink">
              <Camera size={16} aria-hidden /> Camera: {cameraOk ? "working" : "waiting…"}
            </p>
            <div>
              <p className="flex items-center gap-2 text-ink">
                <Mic size={16} aria-hidden /> Microphone: say something
              </p>
              <div className="mt-2 h-2 w-full bg-ink/10" role="meter" aria-label="Microphone level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level * 100)}>
                <div className="h-2 bg-accent transition-[width] duration-100" style={{ width: `${Math.round(level * 100)}%` }} />
              </div>
            </div>
            {problem && <p className="text-sm text-ink">{problem}</p>}
            <Button disabled={!cameraOk} onClick={onReady}>
              Next
            </Button>
          </div>
        </div>
      )}
    </CutCard>
  );
}

/** The plain-language notice of what is monitored, and the "I agree". */
function Consent({ access, onAgreed }: { access: Open; onAgreed: () => void }) {
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <CutCard className="h-auto">
      <h2 className="font-serif text-xl text-ink">2. What the interview room watches</h2>
      <p className="mt-2 text-sm leading-relaxed text-ink/75">
        To keep the interview fair for everyone, FusionX@SCRIET&rsquo;s interview room notices the following and shows it to your interview
        panel. It can&rsquo;t read your screen and does not record anything.
      </p>
      <ul className="mt-4 list-disc space-y-1.5 pl-5 text-sm text-ink">
        <li>Your camera and microphone, live to the panel (and to the other candidates in your slot).</li>
        {access.phone_camera !== "off" && (
          <li>
            Your phone as a second camera showing your desk and hands
            {access.phone_camera === "required" ? " (required)" : " (if you connect it)"}.
          </li>
        )}
        <li>When you switch tabs, leave this window, or leave fullscreen.</li>
        <li>Copy, paste, cut and right-click: these are blocked, and each try is noted.</li>
        <li>If your computer is using a second screen (on browsers that can tell).</li>
        <li>When your camera or microphone is turned off, and when you leave or rejoin.</li>
      </ul>
      <p className="mt-4 text-sm text-ink/75">Nothing is recorded: no video, audio, screenshots or typing is stored. Only the list of these events and their times is kept for the panel.</p>
      <label className="mt-5 flex items-start gap-3 text-sm text-ink">
        <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--color-accent)]" checked={agree} onChange={(e) => setAgree(e.target.checked)} />I agree to these rules for my interview.
      </label>
      {error && (
        <p role="alert" className="mt-3 text-sm text-ink">
          {error}
        </p>
      )}
      <Button
        className="mt-5"
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
    return () => {
      stop = true;
      window.clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, [bookingId, slotId, active]);
  return questions;
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

/**
 * The FusionX Interview Room for a candidate: device check → consent → the
 * call (Daily Prebuilt in a frame), in fullscreen when the day asks for it,
 * with the revealed questions and the phone-camera QR beside it.
 */
export function CandidateRoom({ access }: { access: Open }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(access.consented_at ? "ready" : "device");
  const [error, setError] = useState("");
  const [joining, setJoining] = useState(false);
  const [fullscreen, setFullscreen] = useState(true);
  const [phoneConnected, setPhoneConnected] = useState(false);
  const [moved, setMoved] = useState(false);
  const shell = useRef<HTMLDivElement>(null);
  const frameHost = useRef<HTMLDivElement>(null);
  const call = useRef<DailyCall | null>(null);
  const inRoom = step === "room";
  const onFullscreenExit = useCallback(() => setFullscreen(false), []);
  const { record } = useIntegrity(access.booking_id, inRoom, { strictFullscreen: access.strict_fullscreen, onFullscreenExit });
  const questions = useRevealedQuestions(access.booking_id, access.slot_id, inRoom);

  // The room closes at the end of the window: back to the page, which then says the slot has ended.
  useEffect(() => {
    const ms = new Date(access.closes_at).getTime() - Date.now();
    const timer = window.setTimeout(() => router.refresh(), Math.max(ms, 0) + 1000);
    return () => window.clearTimeout(timer);
  }, [access.closes_at, router]);

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => () => void call.current?.destroy(), []);

  // The panel can switch the day back to Google Meet at any time: leave the call and say where to go.
  useEffect(() => {
    if (!inRoom || moved) return;
    const timer = window.setInterval(async () => {
      if (await roomStillOn(access.booking_id).catch(() => true)) return;
      void call.current?.destroy();
      call.current = null;
      setMoved(true);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [inRoom, moved, access.booking_id]);

  const enterFullscreen = async () => {
    if (!access.strict_fullscreen) return;
    try {
      await shell.current?.requestFullscreen();
    } catch {}
  };

  const join = async () => {
    setJoining(true);
    setError("");
    await enterFullscreen();
    const res = await joinInterview(access.booking_id);
    if (!res.ok) {
      setJoining(false);
      setError(res.message);
      return;
    }
    setStep("room");
    const Daily = (await import("@daily-co/daily-js")).default;
    // Wait a frame for the room layout (and its frame host) to render.
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    if (!frameHost.current) return;
    call.current?.destroy();
    const frame = Daily.createFrame(frameHost.current, {
      iframeStyle: { width: "100%", height: "100%", border: "0" },
      showLeaveButton: true,
      showFullscreenButton: false,
    });
    call.current = frame;
    let joinedOnce = false;
    const phoneId = phoneUserId(access.booking_id);
    let cameraOff = false;
    let micOff = false;
    frame
      .on("joined-meeting", () => {
        if (joinedOnce) record("rejoined");
        joinedOnce = true;
        const others = Object.values(frame.participants()) as DailyParticipant[];
        if (others.some((p) => p.user_id === phoneId)) setPhoneConnected(true);
      })
      .on("left-meeting", () => record("left_room"))
      .on("participant-joined", (e) => {
        if (e?.participant.user_id === phoneId) {
          setPhoneConnected(true);
          record("phone_camera_joined");
        }
      })
      .on("participant-left", (e) => {
        if (e?.participant.user_id === phoneId) {
          setPhoneConnected(false);
          record("phone_camera_left");
        }
      })
      .on("participant-updated", (e) => {
        const p = e?.participant;
        if (!p?.local) return;
        const videoOff = p.tracks?.video?.state === "off";
        const audioOff = p.tracks?.audio?.state === "off";
        if (videoOff && !cameraOff) record("camera_off");
        if (audioOff && !micOff) record("mic_off");
        cameraOff = videoOff;
        micOff = audioOff;
      });
    try {
      await frame.join({ url: res.url, token: res.token });
    } catch {
      setError("Could not connect to the call. Check your internet connection and press Join again.");
    }
    setJoining(false);
  };

  return (
    <div ref={shell} className={cn(inRoom && "bg-paper", inRoom && "fixed inset-0 z-50 flex flex-col")}>
      {!inRoom && (
        <div className="space-y-6">
          {step === "device" && <DeviceCheck onReady={() => setStep("consent")} />}
          {step === "consent" && <Consent access={access} onAgreed={() => setStep("ready")} />}
          {step === "ready" && (
            <CutCard className="h-auto">
              <h2 className="font-serif text-xl text-ink">3. Join your interview</h2>
              <p className="mt-2 text-sm text-ink/75">
                Your slot: {slotRange(access.starts_at, access.ends_at)} IST.
                {access.strict_fullscreen ? " The interview opens in fullscreen; stay in fullscreen until it ends." : ""}
              </p>
              {error && (
                <p role="alert" className="mt-3 text-sm text-ink">
                  {error}
                </p>
              )}
              <Button className="mt-5" disabled={joining} onClick={join}>
                <Maximize size={16} aria-hidden /> {joining ? "Opening the room…" : "Join the interview room"}
              </Button>
            </CutCard>
          )}
        </div>
      )}

      {inRoom && (
        <div className="relative flex min-h-0 flex-1 flex-col lg:flex-row">
          <div ref={frameHost} data-interview-frame className="min-h-[60vh] flex-1 bg-black lg:min-h-0" />
          <aside className="w-full shrink-0 overflow-y-auto border-t border-line bg-surface p-5 lg:w-96 lg:border-l lg:border-t-0" aria-label="Interview questions and phone camera">
            <p className="text-xs text-ink/70">FusionX@SCRIET interview room · {slotRange(access.starts_at, access.ends_at)} IST</p>
            <h2 className="mt-4 font-serif text-lg text-ink">Questions</h2>
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
            {access.phone_camera !== "off" && (
              <div className="mt-6 border-t border-line pt-5">
                <PhoneQr access={access} connected={phoneConnected} />
              </div>
            )}
            {error && (
              <p role="alert" className="mt-4 text-sm text-ink">
                {error}
              </p>
            )}
          </aside>

          {moved && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-paper p-6" role="alertdialog" aria-modal="true" aria-labelledby="moved-title">
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

          {access.strict_fullscreen && !fullscreen && !moved && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-paper/95 p-6" role="dialog" aria-modal="true" aria-labelledby="fs-title">
              <div className="max-w-md text-center">
                <h2 id="fs-title" className="font-serif text-2xl text-ink">
                  Return to fullscreen
                </h2>
                <p className="mt-3 text-sm text-ink/75">The interview continues in fullscreen. Leaving fullscreen has been noted for the panel.</p>
                <Button
                  className="mt-5"
                  onClick={async () => {
                    try {
                      await shell.current?.requestFullscreen();
                    } catch {}
                  }}
                >
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
