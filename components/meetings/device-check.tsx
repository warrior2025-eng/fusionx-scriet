"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Camera, CameraOff, Mic, MicOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DEVICE_KEYS } from "@/lib/interview/device";

type Lists = { camera: MediaDeviceInfo[]; microphone: MediaDeviceInfo[]; speaker: MediaDeviceInfo[] };

const stored = (key: string) => {
  try {
    return sessionStorage.getItem(key) || "";
  } catch {
    return "";
  }
};
const store = (key: string, value: string) => {
  try {
    if (value) sessionStorage.setItem(key, value);
    else sessionStorage.removeItem(key);
  } catch {}
};

const noSubscribe = () => () => {};

function problemText(e: unknown): string {
  const name = e instanceof Error ? e.name : "";
  if (/NotAllowed|Security/i.test(name)) return "The browser is blocking your camera or microphone. Allow them in the address bar, then press Test again. You can also join without them.";
  if (/NotFound|Overconstrained/i.test(name)) return "No camera or microphone was found. You can still join and listen.";
  if (/NotReadable|TrackStart|Abort/i.test(name)) return "Another app is using your camera or microphone. Close it, then press Test again.";
  return "Your camera or microphone could not start. Press Test again, or join without them.";
}

/**
 * Before joining: camera and microphone preview, pickers, Test again. A device that does
 * not work does not stop anyone from entering; this is a meeting, not a test. The picks
 * go in the same place as the interview room's device check, for this tab only.
 */
export function DeviceCheck({
  title,
  defaultMuted,
  defaultCameraOff,
  busy,
  onJoin,
  onBack,
}: {
  title: string;
  defaultMuted: boolean;
  defaultCameraOff: boolean;
  busy?: boolean;
  onJoin: (choice: { muted: boolean; cameraOff: boolean }) => void;
  onBack?: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const live = useRef<{ stream: MediaStream | null; raf: number; audio: AudioContext | null }>({ stream: null, raf: 0, audio: null });
  const [issue, setIssue] = useState("");
  const [level, setLevel] = useState(0);
  const [lists, setLists] = useState<Lists>({ camera: [], microphone: [], speaker: [] });
  const [picked, setPicked] = useState({ camera: "", microphone: "", speaker: "" });
  const [muted, setMuted] = useState(defaultMuted);
  const [cameraOff, setCameraOff] = useState(defaultCameraOff);
  const [secure, setSecure] = useState(true);
  const canPickSpeaker = useSyncExternalStore(noSubscribe, () => "setSinkId" in HTMLMediaElement.prototype, () => false);

  const stop = useCallback(() => {
    cancelAnimationFrame(live.current.raf);
    live.current.stream?.getTracks().forEach((t) => t.stop());
    void live.current.audio?.close().catch(() => {});
    live.current = { stream: null, raf: 0, audio: null };
  }, []);
  useEffect(() => stop, [stop]);

  const test = useCallback(
    async (choice?: { camera?: string; microphone?: string }) => {
      stop();
      setIssue("");
      setLevel(0);
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setSecure(false);
        setIssue("This browser can't use a camera here. Please open the site in Chrome, Edge or Safari.");
        return;
      }
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
        setPicked((p) => ({ ...p, camera: stream.getVideoTracks()[0]?.getSettings().deviceId ?? "", microphone: stream.getAudioTracks()[0]?.getSettings().deviceId ?? "" }));
        try {
          const audio = new AudioContext();
          live.current.audio = audio;
          void audio.resume().catch(() => {});
          const analyser = audio.createAnalyser();
          analyser.fftSize = 256;
          audio.createMediaStreamSource(stream).connect(analyser);
          const data = new Uint8Array(analyser.frequencyBinCount);
          const meter = () => {
            analyser.getByteFrequencyData(data);
            setLevel(Math.min(1, data.reduce((x, y) => x + y, 0) / data.length / 60));
            live.current.raf = requestAnimationFrame(meter);
          };
          meter();
        } catch {}
      } catch (e) {
        setIssue(problemText(e));
      }
    },
    [stop],
  );

  useEffect(() => {
    const first = window.setTimeout(() => void test(), 0);
    return () => window.clearTimeout(first);
  }, [test]);

  const pick = (kind: keyof Lists, id: string) => {
    setPicked((p) => ({ ...p, [kind]: id }));
    if (kind === "speaker") store(DEVICE_KEYS.speaker, id);
    else void test({ [kind]: id });
  };
  const join = () => {
    store(DEVICE_KEYS.camera, picked.camera);
    store(DEVICE_KEYS.microphone, picked.microphone);
    stop();
    onJoin({ muted, cameraOff });
  };
  const select = (kind: keyof Lists, label: string) =>
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
    <div className="mx-auto w-full max-w-4xl">
      <h2 className="font-serif text-2xl text-ink">{title}</h2>
      <p className="mt-1 text-sm text-ink/70">Check your camera and microphone. Nothing is recorded.</p>
      <div className="mt-5 grid gap-5 md:grid-cols-[1fr_17rem] md:items-start">
        <div className="relative aspect-video bg-black">
          <video ref={video} autoPlay playsInline muted className="h-full w-full object-cover" aria-label="Your camera preview" />
          {cameraOff && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#00030D] text-sm text-white/85">
              <CameraOff size={18} className="mr-2" aria-hidden /> You will join with your camera off
            </div>
          )}
        </div>
        <div className="space-y-4 text-sm">
          <div>
            <p className="flex items-center gap-2 text-ink">
              <Mic size={16} aria-hidden /> Microphone
            </p>
            <div className="mt-2 h-2 w-full bg-ink/10" role="meter" aria-label="Microphone level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level * 100)}>
              <div className="h-2 bg-accent transition-[width] duration-100" style={{ width: `${Math.round(level * 100)}%` }} />
            </div>
          </div>
          {select("camera", "Camera")}
          {select("microphone", "Microphone")}
          {canPickSpeaker && select("speaker", "Speaker")}
          <label className="flex items-center gap-2 text-ink">
            <input type="checkbox" checked={muted} onChange={(e) => setMuted(e.target.checked)} className="h-4 w-4 accent-accent" />
            <MicOff size={15} aria-hidden /> Join muted
          </label>
          <label className="flex items-center gap-2 text-ink">
            <input type="checkbox" checked={cameraOff} onChange={(e) => setCameraOff(e.target.checked)} className="h-4 w-4 accent-accent" />
            <Camera size={15} aria-hidden /> Join with camera off
          </label>
          {issue && (
            <p role="alert" className="border border-red-500/50 bg-red-500/10 p-3 leading-relaxed text-ink">
              {issue}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="lg" className="w-full" loading={busy} onClick={join}>
              Join meeting
            </Button>
            {secure && (
              <Button variant="secondary" onClick={() => void test()}>
                Test again
              </Button>
            )}
            {onBack && (
              <Button variant="ghost" onClick={onBack}>
                Back to my pass
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
