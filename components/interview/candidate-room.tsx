"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Camera, CheckCircle2, Clock, Maximize, Mic, Smartphone, TriangleAlert } from "lucide-react";
import { giveConsent, joinInterview, myInterviewQuestions, phoneCameraLink, roomStillOn } from "@/actions/interview";
import { LiveKitStage } from "@/components/interview/livekit-stage";
import { useIntegrity } from "@/components/interview/use-integrity";
import { countdownText, useServerClock } from "@/components/interview/use-server-clock";
import { Button, LinkButton } from "@/components/ui/button";
import { CutCard } from "@/components/ui/cut-card";
import { phoneUserId, type InterviewWindow, type RevealedQuestion } from "@/lib/interview/shared";
import { slotRange, slotTime } from "@/lib/recruitment/slots";
import { joinErrorText } from "@/lib/interview/join-error";
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
 * call (LiveKit), in fullscreen when the day asks for it,
 * with the revealed questions and the phone-camera QR beside it.
 *
 * The day has one room; a candidate is in it for their own slot only. Opened
 * early on the day, the page waits ("Waiting room", with a countdown) and
 * connects by itself when the slot's join time comes. When the slot ends
 * (by the database's clock) the call closes and cannot be joined again; the
 * server also removes anyone still connected.
 */
export function CandidateRoom({ access }: { access: Open & { state?: string } }) {
  const [step, setStep] = useState<Step>(access.consented_at ? "ready" : "device");
  const [error, setError] = useState("");
  const [joining, setJoining] = useState(false);
  const [fullscreen, setFullscreen] = useState(true);
  const [phoneConnected, setPhoneConnected] = useState(false);
  const [moved, setMoved] = useState(false);
  const [ended, setEnded] = useState(false);
  const endedRef = useRef(false);
  const shell = useRef<HTMLDivElement>(null);
  // The call: its server and token while connected (null = not in the call).
  const [conn, setConn] = useState<{ serverUrl: string; token: string } | null>(null);
  const joinedOnce = useRef(false);
  const phoneId = phoneUserId(access.booking_id);
  const inRoom = step === "room";
  const onFullscreenExit = useCallback(() => setFullscreen(false), []);
  const { record } = useIntegrity(access.booking_id, inRoom, { strictFullscreen: access.strict_fullscreen, onFullscreenExit });
  const questions = useRevealedQuestions(access.booking_id, access.slot_id, inRoom);

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
        if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
      },
      Math.max(closesAt - now(), 0) + 500,
    );
    return () => window.clearTimeout(timer);
  }, [closesAt, now]);

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // The panel can switch the day back to Google Meet at any time: leave the call and say where to go.
  useEffect(() => {
    if (!inRoom || moved) return;
    const timer = window.setInterval(async () => {
      if (await roomStillOn(access.booking_id).catch(() => true)) return;
      setConn(null);
      setMoved(true);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [inRoom, moved, access.booking_id]);

  const join = useCallback(
    async (auto = false) => {
      setJoining(true);
      setError("");
      // Fullscreen needs a click; when the waiting room connects by itself, the "Return to fullscreen" screen asks for it.
      if (access.strict_fullscreen && !auto) {
        try {
          await shell.current?.requestFullscreen();
        } catch {}
      }
      let res = await joinInterview(access.booking_id);
      // A device clock a few seconds fast: the server says "not yet"; try again shortly.
      for (let i = 0; auto && !res.ok && /room opens at/i.test(res.message) && i < 5; i++) {
        await new Promise((r) => window.setTimeout(r, 3000));
        res = await joinInterview(access.booking_id);
      }
      setJoining(false);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      if (endedRef.current) return;
      setConn({ serverUrl: res.serverUrl, token: res.token });
      setStep("room");
      setFullscreen(Boolean(document.fullscreenElement));
    },
    [access.booking_id, access.strict_fullscreen],
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
  }, [record]);
  const onDisconnected = useCallback(
    (removed: boolean) => {
      setConn(null);
      // Removed by the server (slot over, or the day moved to Google Meet), or closed by the timer: not "left".
      if (removed || endedRef.current) {
        if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
        if (endedRef.current) {
          setEnded(true);
          return;
        }
        void roomStillOn(access.booking_id)
          .catch(() => true)
          .then((on) => {
            if (on) {
              endedRef.current = true;
              setEnded(true);
            } else setMoved(true);
          });
        return;
      }
      record("left_room");
    },
    [record, access.booking_id],
  );
  const onCallError = useCallback((message: string) => {
    setError(joinErrorText(message, "candidate"));
  }, []);
  const onPeople = useCallback((ids: string[]) => setPhoneConnected(ids.includes(phoneId)), [phoneId]);
  const onJoined = useCallback((id: string) => id === phoneId && record("phone_camera_joined"), [phoneId, record]);
  const onLeft = useCallback((id: string) => id === phoneId && record("phone_camera_left"), [phoneId, record]);
  const onLocalOff = useCallback((kind: "camera" | "microphone") => record(kind === "camera" ? "camera_off" : "mic_off"), [record]);
  const rejoin = async () => {
    setError("");
    const res = await joinInterview(access.booking_id);
    if (res.ok) setConn({ serverUrl: res.serverUrl, token: res.token });
    else setError(res.message);
  };

  return (
    <div ref={shell} className={cn(inRoom && "bg-paper", inRoom && "fixed inset-0 z-50 flex flex-col")}>
      {!inRoom && (
        <div className="space-y-6">
          {step === "device" && <DeviceCheck onReady={() => setStep("consent")} />}
          {step === "consent" && <Consent access={access} onAgreed={() => setStep("ready")} />}
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
            <CutCard className="h-auto">
              <h2 className="flex items-center gap-2 font-serif text-xl text-ink">
                <Clock size={18} aria-hidden /> Waiting room
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-ink/75">
                Your slot: {slotRange(access.starts_at, access.ends_at)} IST. You will be connected to the interview room by itself at{" "}
                {slotTime(access.opens_at)}. Keep this page open
                {access.strict_fullscreen ? "; the interview then runs in fullscreen" : ""}.
              </p>
              {tick !== null && (
                <p className="mt-5 font-serif text-4xl tabular-nums text-ink" role="timer" aria-live="off">
                  {countdownText(opensAt - tick)}
                </p>
              )}
              {access.phone_camera !== "off" && (
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
          )}
          {step === "ready" && !ended && !waiting && (
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
              <Button className="mt-5" disabled={joining} onClick={() => void join()}>
                <Maximize size={16} aria-hidden /> {joining ? "Opening the room…" : "Join the interview room"}
              </Button>
            </CutCard>
          )}
        </div>
      )}

      {inRoom && (
        <div className="relative flex min-h-0 flex-1 flex-col lg:flex-row">
          <div data-interview-frame className="relative min-h-[60vh] flex-1 bg-black lg:min-h-0">
            {conn ? (
              <LiveKitStage
                serverUrl={conn.serverUrl}
                token={conn.token}
                mode="candidate"
                hold={hold}
                onConnected={onConnected}
                onDisconnected={onDisconnected}
                onError={onCallError}
                onPeople={onPeople}
                onJoined={onJoined}
                onLeft={onLeft}
                onLocalOff={onLocalOff}
              />
            ) : (
              !moved &&
              !ended && (
                <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
                  <p className="text-sm text-white/85">You are not in the call.</p>
                  <Button onClick={rejoin}>Rejoin the call</Button>
                </div>
              )
            )}
          </div>
          <aside className="w-full shrink-0 overflow-y-auto border-t border-line bg-surface p-5 lg:w-96 lg:border-l lg:border-t-0" aria-label="Interview questions and phone camera">
            <p className="text-xs text-ink/70">FusionX@SCRIET interview room · {slotRange(access.starts_at, access.ends_at)} IST</p>
            {tick !== null && !ended && (
              <p className="mt-2 text-sm tabular-nums text-ink" role="timer" aria-live="off">
                {hold ? `Your slot starts in ${countdownText(startsAt - tick)}. Camera and microphone turn on then.` : `Your slot ends in ${countdownText(closesAt - tick)}`}
              </p>
            )}
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

          {ended && !moved && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-paper p-6" role="alertdialog" aria-modal="true" aria-labelledby="ended-title">
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

          {access.strict_fullscreen && !fullscreen && !moved && !ended && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-paper/95 p-6" role="dialog" aria-modal="true" aria-labelledby="fs-title">
              <div className="max-w-md text-center">
                <h2 id="fs-title" className="font-serif text-2xl text-ink">
                  Return to fullscreen
                </h2>
                <p className="mt-3 text-sm text-ink/75">The interview runs in fullscreen. Each time it is left, the panel is told.</p>
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
