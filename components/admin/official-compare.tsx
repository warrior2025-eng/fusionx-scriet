"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { applyCorrections } from "@/actions/admin-results";
import { Button } from "@/components/ui/button";
import { Label, Select, Textarea } from "@/components/ui/field";
import { compareHub, correctionMessage, matchName, normalizeName, parseNames, type CompareCandidate, type HubResult, type NameMatch } from "@/lib/recruitment/official-compare";
import { Pill } from "./ui";

export type OfficialList = { id: string; name: string; hubs: { hub: string; names: string[] }[] };
type Team = { id: string; name: string };
type Change = { application_id: string; team_id: string; hub: string; name: string; from: "undecided" | "selected" | "waitlisted" | "not_selected" | "none"; to: "selected" | "not_selected" };

/**
 * "Compare with official list": names per hub, matched to candidates, with what differs. Nothing
 * changes until the confirm screen is answered, and only then through the database's own check.
 */
export function OfficialCompare({ cycleId, teams, candidates, lists }: { cycleId: string; teams: Team[]; candidates: CompareCandidate[]; lists: OfficialList[] }) {
  const router = useRouter();
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [listName, setListName] = useState("");
  const [compared, setCompared] = useState<Record<string, NameMatch[]> | null>(null);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [told, setTold] = useState<Record<string, boolean>>({});
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState("");
  const [done, setDone] = useState("");
  const [pending, startTransition] = useTransition();
  const dialogRef = useRef<HTMLDialogElement>(null);

  const loadList = (id: string) => {
    const list = lists.find((l) => l.id === id);
    setListName(id);
    if (!list) return;
    const next: Record<string, string> = {};
    for (const team of teams) {
      const hub = list.hubs.find((h) => normalizeName(h.hub) === normalizeName(team.name));
      next[team.id] = hub ? hub.names.join("\n") : "";
    }
    setTexts(next);
  };
  const unmatchedHubs = useMemo(() => {
    const list = lists.find((l) => l.id === listName);
    return list ? list.hubs.filter((h) => !teams.some((t) => normalizeName(t.name) === normalizeName(h.hub))).map((h) => h.hub) : [];
  }, [lists, listName, teams]);

  const compare = () => {
    const out: Record<string, NameMatch[]> = {};
    for (const team of teams) {
      const names = parseNames(texts[team.id] ?? "");
      if (names.length) out[team.id] = names.map((n) => matchName(n, candidates));
    }
    setCompared(out);
    setDone("");
    setProblem("");
  };

  // Re-reads the fresh candidates, so after applying this shows everything correct.
  const results: HubResult[] = compared ? Object.entries(compared).map(([teamId, matches]) => compareHub(teamId, matches, picks, candidates)) : [];
  const hubName = (id: string) => teams.find((t) => t.id === id)?.name ?? "";
  const changes: Change[] = results.flatMap((r) => [
    ...r.shouldBe.map((c) => ({ application_id: c.application_id, team_id: r.teamId, hub: hubName(r.teamId), name: c.name, from: (c.decisions[r.teamId] ?? "none") as Change["from"], to: "selected" as const })),
    ...r.shouldNotBe.map((c) => ({ application_id: c.application_id, team_id: r.teamId, hub: hubName(r.teamId), name: c.name, from: "selected" as const, to: "not_selected" as const })),
  ]);
  const waiting = results.some((r) => r.toConfirm.length > 0);
  const people = [...new Set(changes.map((c) => c.application_id))];
  const defaultMessage = (id: string) => {
    const mine = changes.filter((c) => c.application_id === id);
    return correctionMessage(mine.filter((c) => c.to === "selected").map((c) => c.hub), mine.filter((c) => c.to === "not_selected").map((c) => c.hub));
  };

  const apply = () => {
    setProblem("");
    startTransition(async () => {
      const notices = people.filter((id) => told[id] !== false).map((id) => ({ application_id: id, message: messages[id] ?? defaultMessage(id) }));
      const result = await applyCorrections(cycleId, {
        reason,
        items: changes.map(({ application_id, team_id, from, to }) => ({ application_id, team_id, from, to })),
        notices,
      });
      if (result.status !== "success") return setProblem(result.message ?? "Could not apply them.");
      dialogRef.current?.close();
      setDone(result.message ?? "Applied.");
      setReason("");
      router.refresh();
    });
  };

  const list = (title: string, tone: "good" | "bad" | "warn", people: string[], key: string) => (
    <div data-compare={key}>
      <p className="mb-1 flex items-center gap-2 text-sm font-medium text-ink">
        <Pill tone={tone}>{people.length}</Pill> {title}
      </p>
      {people.length > 0 && <ul className="ml-1 list-inside list-disc text-sm text-ink/80">{people.map((p) => <li key={p}>{p}</li>)}</ul>}
    </div>
  );

  return (
    <div className="space-y-6">
      {lists.length > 0 && (
        <div className="max-w-md">
          <Label htmlFor="official-list">Saved list</Label>
          <Select id="official-list" value={listName} onChange={(e) => loadList(e.target.value)}>
            <option value="">Choose a list, or paste names below</option>
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
          {unmatchedHubs.length > 0 && <p className="mt-1 text-sm text-amber-700">Not in this recruitment: {unmatchedHubs.join(", ")}</p>}
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {teams.map((team) => (
          <div key={team.id}>
            <Label htmlFor={`names-${team.id}`}>{team.name}</Label>
            <Textarea
              id={`names-${team.id}`}
              data-names={team.name}
              rows={6}
              value={texts[team.id] ?? ""}
              onChange={(e) => setTexts({ ...texts, [team.id]: e.target.value })}
              placeholder="One name per line. A hub left empty is not compared."
            />
          </div>
        ))}
      </div>
      <Button type="button" onClick={compare}>
        Compare
      </Button>

      {done && (
        <p role="status" className="border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-2.5 text-sm text-ink">
          {done}
        </p>
      )}

      {compared &&
        results.map((r) => (
          <section key={r.teamId} className="border border-line p-4" aria-label={hubName(r.teamId)} data-hub-result={hubName(r.teamId)}>
            <h2 className="font-serif text-xl text-ink">{hubName(r.teamId)}</h2>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              {list("Correct", "good", r.correct.map((c) => c.name), "correct")}
              {list("Should be Selected but isn't", "bad", r.shouldBe.map((c) => c.name), "should-be")}
              {list("Is Selected but shouldn't be", "bad", r.shouldNotBe.map((c) => c.name), "should-not-be")}
              {list("Not found", "warn", r.notFound, "not-found")}
            </div>
            {[...r.toConfirm, ...(compared[r.teamId] ?? []).filter((m) => m.kind !== "exact" && !r.toConfirm.includes(m))].map((m) => (
              <div key={m.official} className="mt-3 max-w-lg" data-confirm={m.official}>
                <Label htmlFor={`pick-${r.teamId}-${m.official}`}>
                  Who is &ldquo;{m.official}&rdquo;? {m.kind === "close" ? "Close match: confirm or pick." : "Pick the right person."}
                </Label>
                <Select
                  id={`pick-${r.teamId}-${m.official}`}
                  value={picks[`${r.teamId}:${m.official}`] ?? ""}
                  onChange={(e) => setPicks({ ...picks, [`${r.teamId}:${m.official}`]: e.target.value })}
                >
                  <option value="">{m.kind === "close" ? "Not confirmed yet" : "Nobody: leave as not found"}</option>
                  {m.options.map((c) => (
                    <option key={c.application_id} value={c.application_id}>
                      {c.name} {c.detail ? `(${c.detail})` : ""}
                    </option>
                  ))}
                  {m.options.length > 0 && <option disabled>────────</option>}
                  {candidates
                    .filter((c) => !m.options.some((o) => o.application_id === c.application_id))
                    .map((c) => (
                      <option key={c.application_id} value={c.application_id}>
                        {c.name} {c.detail ? `(${c.detail})` : ""}
                      </option>
                    ))}
                </Select>
              </div>
            ))}
          </section>
        ))}

      {compared && (
        <div>
          {changes.length === 0 && !waiting ? (
            <p className="text-sm font-medium text-ink" data-all-correct>
              Everything matches the official list.
            </p>
          ) : (
            <Button type="button" disabled={waiting || changes.length === 0} onClick={() => dialogRef.current?.showModal()}>
              Apply corrections
            </Button>
          )}
          {waiting && <p className="mt-2 text-sm text-ink/70">Confirm the close matches first.</p>}
        </div>
      )}

      <dialog ref={dialogRef} aria-label="Apply corrections" className="m-auto w-[min(94vw,44rem)] border border-line bg-surface p-6 text-ink backdrop:bg-black/60" data-apply>
        <h2 className="font-serif text-xl">Apply {changes.length} {changes.length === 1 ? "correction" : "corrections"}?</h2>
        <ul className="mt-3 max-h-48 list-disc space-y-1 overflow-y-auto pl-5 text-sm text-ink/85">
          {changes.map((c) => (
            <li key={`${c.application_id}:${c.team_id}`}>
              {c.name} in {c.hub}: {c.to === "selected" ? "becomes Selected" : "no longer Selected"}
            </li>
          ))}
        </ul>
        <div className="mt-4">
          <Label htmlFor="correction-reason">Reason (required, kept in the audit log)</Label>
          <Textarea id="correction-reason" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <h3 className="mt-4 text-sm font-semibold text-ink">Who is told</h3>
        <p className="text-xs text-ink/65">Only these people. Nobody else hears anything.</p>
        <ul className="mt-2 max-h-64 space-y-3 overflow-y-auto">
          {people.map((id) => (
            <li key={id}>
              <label className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" checked={told[id] !== false} onChange={(e) => setTold({ ...told, [id]: e.target.checked })} className="h-4 w-4 accent-accent" />
                {changes.find((c) => c.application_id === id)?.name}
              </label>
              {told[id] !== false && (
                <Textarea
                  aria-label={`Message to ${changes.find((c) => c.application_id === id)?.name}`}
                  className="mt-1"
                  rows={2}
                  maxLength={1000}
                  value={messages[id] ?? defaultMessage(id)}
                  onChange={(e) => setMessages({ ...messages, [id]: e.target.value })}
                />
              )}
            </li>
          ))}
        </ul>
        {problem && (
          <p role="alert" className="mt-3 text-sm text-red-600">
            {problem}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => dialogRef.current?.close()}>
            Go back
          </Button>
          <Button type="button" size="sm" loading={pending} disabled={reason.trim().length < 3} onClick={apply}>
            Apply these changes
          </Button>
        </div>
      </dialog>
    </div>
  );
}
