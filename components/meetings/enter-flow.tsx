"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Smartphone, UserX } from "lucide-react";
import { setCantMakeIt } from "@/actions/meetings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { ENTER_REASONS, passPhase, type Entered, type Pass, type PassOwner } from "@/lib/meetings/shared";
import { DeviceCheck } from "./device-check";
import { MeetingPass } from "./meeting-pass";
import { QrPanel } from "./qr-panel";
import { MeetingRoom } from "./room-lazy";

type Stage = "pass" | "check" | "lobby" | "room" | "done";
export type LeaveReason = "left" | "moved" | "removed" | "ended" | "lost";

const DONE_TEXT: Record<LeaveReason, string> = {
  left: "You left the meeting.",
  moved: "You moved to another device.",
  removed: "A host removed you from this meeting.",
  ended: "The meeting has ended.",
  lost: "The connection was lost.",
};

/**
 * The page of a meeting for someone with a pass: the pass → device check → lobby (when
 * on) → room. Asks for a token only when entering, and every time it asks the server
 * checks again.
 */
export function EnterFlow({ pass, owner, serverNow, enter }: { pass: Pass; owner: PassOwner | null; serverNow: string; enter: "" | "1" | "direct" }) {
  const router = useRouter();
  const [nowAtLoad] = useState(() => new Date(serverNow).getTime());
  const canEnterNow = passPhase(pass, nowAtLoad) === "doors" || pass.phase === "live";
  const [stage, setStage] = useState<Stage>(canEnterNow && enter === "1" ? "check" : "pass");
  const [entered, setEntered] = useState<Entered | null>(null);
  const [choice, setChoice] = useState({ muted: pass.join_muted, cameraOff: pass.join_camera_off });
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<LeaveReason>("left");
  const [qr, setQr] = useState(false);
  const [cant, setCant] = useState(false);
  const [reason, setReason] = useState(pass.cant_reason ?? "");
  const qrDialog = useRef<HTMLDialogElement>(null);
  const cantDialog = useRef<HTMLDialogElement>(null);

  const askToken = useCallback(async () => {
    const res = await fetch(`/api/meetings/${pass.id}/token`, { method: "POST" });
    const data = (await res.json().catch(() => ({}))) as Partial<Entered> & { ok?: boolean; reason?: string };
    if (data.ok && data.token) {
      setEntered(data as Entered);
      setStage("room");
      return;
    }
    if (data.reason === "lobby") {
      setStage("lobby");
      return;
    }
    setProblem(ENTER_REASONS[data.reason ?? ""] ?? "The meeting could not be opened. Please try again.");
    setStage("pass");
  }, [pass.id]);

  const join = useCallback(
    async (picked: { muted: boolean; cameraOff: boolean }) => {
      setChoice(picked);
      setProblem("");
      setBusy(true);
      await askToken();
      setBusy(false);
    },
    [askToken],
  );

  // Scanned on the phone: straight in, as the meeting's options say.
  const direct = useRef(false);
  useEffect(() => {
    if (enter !== "direct" || direct.current || !canEnterNow) return;
    direct.current = true;
    const first = window.setTimeout(() => void join({ muted: pass.join_muted, cameraOff: pass.join_camera_off }), 0);
    return () => window.clearTimeout(first);
  }, [enter, canEnterNow, join, pass.join_muted, pass.join_camera_off]);

  // In the lobby: keep asking until a host answers.
  useEffect(() => {
    if (stage !== "lobby") return;
    const timer = window.setInterval(() => void askToken(), 3000);
    return () => window.clearInterval(timer);
  }, [stage, askToken]);

  const saveCant = async (value: string) => {
    const result = await setCantMakeIt(pass.id, value);
    if (!result.ok) setProblem(result.error);
    setCant(false);
    cantDialog.current?.close();
    router.refresh();
  };

  if (stage === "room" && entered) {
    return (
      <MeetingRoom
        meetingId={pass.id}
        entered={entered}
        muted={choice.muted || entered.joinMuted}
        cameraOff={choice.cameraOff || entered.joinCameraOff}
        onLeave={(why) => {
          setDone(why);
          setEntered(null);
          setStage("done");
          router.refresh();
        }}
      />
    );
  }
  if (stage === "check") {
    return <DeviceCheck title={pass.title} defaultMuted={pass.join_muted} defaultCameraOff={pass.join_camera_off} busy={busy} onJoin={(c) => void join(c)} onBack={() => setStage("pass")} />;
  }
  if (stage === "lobby") {
    return (
      <div className="mx-auto max-w-md border border-line bg-surface p-8 text-center">
        <p className="mx-auto h-3 w-3 rounded-full bg-accent motion-safe:animate-pulse" aria-hidden />
        <h2 className="mt-4 font-serif text-2xl text-ink">Waiting for the host to let you in</h2>
        <p className="mt-2 text-sm text-ink/70">{pass.title}. You will enter by yourself as soon as a host admits you.</p>
      </div>
    );
  }
  if (stage === "done") {
    return (
      <div className="mx-auto max-w-md border border-line bg-surface p-8 text-center">
        <h2 className="font-serif text-2xl text-ink">{DONE_TEXT[done]}</h2>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {(done === "left" || done === "lost") && <Button onClick={() => void join(choice)}>Rejoin</Button>}
          {done === "ended" && (
            <Link href={`/meetings/${pass.id}/minutes`} className="btn btn--primary inline-flex items-center rounded-sm bg-accent px-5 py-2.5 text-sm font-medium text-white">
              View minutes
            </Link>
          )}
          <Link href="/meetings" className="btn btn--secondary inline-flex items-center rounded-sm border border-ink/40 px-5 py-2.5 text-sm font-medium text-ink">
            My meetings
          </Link>
        </div>
      </div>
    );
  }

  const open = pass.phase === "upcoming" || pass.phase === "doors" || pass.phase === "live";
  return (
    <div className="mx-auto max-w-xl">
      {problem && (
        <p role="alert" className="mb-4 border border-red-500/40 bg-red-500/10 px-3.5 py-2.5 text-sm text-ink">
          {problem}
        </p>
      )}
      <MeetingPass pass={pass} owner={owner} serverNow={serverNow} onEnter={() => setStage("check")} />
      {pass.description && <p className="mt-5 whitespace-pre-line text-sm leading-relaxed text-ink/75">{pass.description}</p>}
      {open && (
        <div className="mt-5 flex flex-wrap gap-2">
          <a href={`/meetings/${pass.id}/calendar.ics`} className="btn btn--secondary inline-flex items-center gap-2 rounded-sm border border-ink/40 px-3.5 py-1.5 text-sm font-medium text-ink hover:border-ink">
            <CalendarPlus size={14} aria-hidden /> Add to calendar
          </a>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              setCant(true);
              cantDialog.current?.showModal();
            }}
          >
            <UserX size={14} aria-hidden /> {pass.cant_reason ? "Change my reply" : "Can’t make it"}
          </Button>
          {pass.phase !== "upcoming" && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="hidden md:inline-flex"
              onClick={() => {
                setQr(true);
                qrDialog.current?.showModal();
              }}
            >
              <Smartphone size={14} aria-hidden /> Join on phone
            </Button>
          )}
        </div>
      )}
      <dialog ref={qrDialog} aria-label="Join on phone" onClose={() => setQr(false)} className="m-auto w-[min(92vw,24rem)] border border-line bg-surface p-6 text-ink backdrop:bg-black/60">
        <h2 className="text-center font-serif text-xl">Join on phone</h2>
        <div className="mt-3">{qr && <QrPanel meetingId={pass.id} purpose="join" />}</div>
        <div className="mt-4 text-center">
          <Button type="button" variant="ghost" size="sm" onClick={() => qrDialog.current?.close()}>
            Close
          </Button>
        </div>
      </dialog>
      <dialog ref={cantDialog} aria-label="Can't make it" onClose={() => setCant(false)} className="m-auto w-[min(92vw,26rem)] border border-line bg-surface p-6 text-ink backdrop:bg-black/60">
        <h2 className="font-serif text-xl">Can&rsquo;t make it?</h2>
        <label className="mt-3 block text-sm text-ink/80">
          A short reason, for the host
          <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} autoComplete="off" className="mt-1.5" />
        </label>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => cantDialog.current?.close()}>
            Close
          </Button>
          {pass.cant_reason && (
            <Button type="button" variant="ghost" size="sm" onClick={() => void saveCant("")}>
              I can make it after all
            </Button>
          )}
          {cant && (
            <Button type="button" size="sm" disabled={reason.trim().length < 2} onClick={() => void saveCant(reason)}>
              Tell the host
            </Button>
          )}
        </div>
      </dialog>
    </div>
  );
}
