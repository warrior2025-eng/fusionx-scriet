/**
 * Comparing a hub's official list with who is selected. Pure, so it runs in the browser as the
 * admin confirms matches. Nothing is applied here.
 */

export type CompareCandidate = {
  application_id: string;
  name: string;
  detail: string;
  /** Hub id to decision, for the hubs this candidate has a row in. */
  decisions: Record<string, string>;
};

export type NameMatch = {
  /** As written on the official list. */
  official: string;
  kind: "exact" | "close" | "none";
  /** Who it matches, best first. Exact has one. */
  options: CompareCandidate[];
};

export const normalizeName = (name: string) =>
  name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

function distance(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(next[j - 1] + 1, row[j] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return row[b.length];
}

const sorted = (name: string) => name.split(" ").sort().join(" ");

/** How close two normalized names are: lower is closer, null is not close. Spelling and short forms count. */
function closeness(official: string, candidate: string): number | null {
  if (sorted(official) === sorted(candidate)) return 0;
  const d = distance(official, candidate);
  if (d <= Math.max(2, Math.floor(Math.max(official.length, candidate.length) * 0.15))) return d;
  // "Aryan" for "Aryan Singh": every word given is in the name.
  const words = new Set(candidate.split(" "));
  if (official.split(" ").every((w) => words.has(w))) return 3 + candidate.split(" ").length - official.split(" ").length;
  return null;
}

export function matchName(official: string, candidates: CompareCandidate[]): NameMatch {
  const wanted = normalizeName(official);
  const exact = candidates.filter((c) => normalizeName(c.name) === wanted);
  if (exact.length === 1) return { official, kind: "exact", options: exact };
  if (exact.length > 1) return { official, kind: "close", options: exact };
  const close = candidates
    .flatMap((c) => {
      const score = closeness(wanted, normalizeName(c.name));
      return score === null ? [] : [{ c, score }];
    })
    .sort((a, b) => a.score - b.score)
    .slice(0, 5)
    .map((x) => x.c);
  return close.length ? { official, kind: "close", options: close } : { official, kind: "none", options: [] };
}

/** One name per line, or separated by commas. */
export const parseNames = (text: string) => [...new Set(text.split(/[\n,;]+/).map((n) => n.replace(/\s+/g, " ").trim()).filter(Boolean))];

export type HubResult = {
  teamId: string;
  correct: CompareCandidate[];
  /** On the list, confirmed as this person, not selected in this hub. */
  shouldBe: CompareCandidate[];
  /** Selected in this hub, not on the list. */
  shouldNotBe: CompareCandidate[];
  notFound: string[];
  /** On the list with a possible match not yet confirmed. */
  toConfirm: NameMatch[];
};

export function compareHub(teamId: string, matches: NameMatch[], picks: Record<string, string>, candidates: CompareCandidate[]): HubResult {
  const byId = new Map(candidates.map((c) => [c.application_id, c]));
  const result: HubResult = { teamId, correct: [], shouldBe: [], shouldNotBe: [], notFound: [], toConfirm: [] };
  const listed = new Set<string>();
  for (const match of matches) {
    const picked = picks[`${teamId}:${match.official}`];
    // By id, so a compare already on screen reads the latest decisions after corrections.
    const person = byId.get(match.kind === "exact" ? match.options[0].application_id : picked);
    if (!person) {
      if (match.kind === "none") result.notFound.push(match.official);
      else result.toConfirm.push(match);
      continue;
    }
    if (listed.has(person.application_id)) continue;
    listed.add(person.application_id);
    (person.decisions[teamId] === "selected" ? result.correct : result.shouldBe).push(person);
  }
  for (const c of candidates) if (c.decisions[teamId] === "selected" && !listed.has(c.application_id)) result.shouldNotBe.push(c);
  return result;
}

/** The default words for someone whose result changed. */
export const correctionMessage = (selectedHubs: string[], removedHubs: string[]) =>
  [
    selectedHubs.length ? `Correction: you have been selected in ${selectedHubs.join(" and ")}. Congratulations!` : "",
    removedHubs.length ? `Correction to your result: ${removedHubs.join(" and ")}. We're sorry for the confusion.` : "",
  ]
    .filter(Boolean)
    .join(" ");
