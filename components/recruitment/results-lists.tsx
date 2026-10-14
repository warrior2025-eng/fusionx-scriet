import { CutCard } from "@/components/ui/cut-card";
import { WAITLIST_NOTE, type PublicResults } from "@/lib/recruitment/results";

type Shown = Extract<PublicResults, { state: "published" | "preview" }>;

const more = (n: number, shown: number) => (n > shown ? `+ ${n - shown} more` : null);

/**
 * The public announcement: per hub, the Selected names and the Waitlist in
 * rank order. Names and hubs only. Someone who did not agree to be named is
 * counted in "+ N more".
 */
export function ResultsLists({ results }: { results: Shown }) {
  if (results.hubs.length === 0) return <p className="text-sm text-ink/70">No hubs to show.</p>;
  return (
    <div className="space-y-8">
      {results.hubs.map((hub) => {
        const selectedMore = more(hub.selected_total, hub.selected.length);
        const waitMore = more(hub.waitlist_total, hub.waitlist.length);
        return (
          <section key={hub.team_id} aria-labelledby={`hub-${hub.team_id}`}>
            <CutCard className="h-auto">
              <h2 id={`hub-${hub.team_id}`} className="font-serif text-2xl text-ink">
                {hub.emoji ? `${hub.emoji} ` : ""}
                {hub.name}
              </h2>
              <div className="mt-6 grid gap-8 md:grid-cols-2">
                <div>
                  <h3 className="flex items-baseline justify-between gap-3 border-b border-line pb-2 text-sm font-semibold uppercase tracking-wide text-ink">
                    Selected <span className="font-normal normal-case tracking-normal text-ink/60">{hub.selected_total}</span>
                  </h3>
                  {!results.show_selected ? (
                    <p className="mt-3 text-sm text-ink/70">{hub.selected_total} selected. Names are not listed.</p>
                  ) : hub.selected_total === 0 ? (
                    <p className="mt-3 text-sm text-ink/60">No one yet.</p>
                  ) : (
                    <ul className="mt-2 divide-y divide-line">
                      {hub.selected.map((name, i) => (
                        <li key={`${name}-${i}`} className="py-2 text-ink">
                          {name}
                        </li>
                      ))}
                      {selectedMore && <li className="py-2 text-sm text-ink/60">{selectedMore}</li>}
                    </ul>
                  )}
                </div>
                <div>
                  <h3 className="flex items-baseline justify-between gap-3 border-b border-line pb-2 text-sm font-semibold uppercase tracking-wide text-ink">
                    Waitlist <span className="font-normal normal-case tracking-normal text-ink/60">{hub.waitlist_total}</span>
                  </h3>
                  {!results.show_waitlist ? (
                    <p className="mt-3 text-sm text-ink/70">{hub.waitlist_total} on the waitlist. Names are not listed.</p>
                  ) : hub.waitlist_total === 0 ? (
                    <p className="mt-3 text-sm text-ink/60">No waitlist.</p>
                  ) : (
                    <ol className="mt-2 divide-y divide-line">
                      {hub.waitlist.map((w) => (
                        <li key={`${w.rank}-${w.name}`} className="flex gap-3 py-2 text-ink">
                          <span className="w-8 shrink-0 tabular-nums text-ink/55">#{w.rank}</span>
                          {w.name}
                        </li>
                      ))}
                      {waitMore && <li className="py-2 text-sm text-ink/60">{waitMore}</li>}
                    </ol>
                  )}
                  {hub.waitlist_total > 0 && <p className="mt-3 text-xs leading-relaxed text-ink/60">{WAITLIST_NOTE}</p>}
                </div>
              </div>
            </CutCard>
          </section>
        );
      })}
    </div>
  );
}
