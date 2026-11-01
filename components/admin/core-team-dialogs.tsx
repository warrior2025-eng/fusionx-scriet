"use client";

import { useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, UserPlus, Users } from "lucide-react";
import {
  addCoreMembers,
  listCoreCandidates,
  saveCoreGroup,
  searchCoreUsers,
  setCoreMemberVisibility,
  setCoreMemberTitle,
  type CoreCandidate,
  type CoreUserHit,
} from "@/actions/admin-core-teams";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/field";
import { InitialsAvatar } from "@/components/ui/initials-avatar";
import { memberDetail } from "@/lib/utils";
import { toast, toastResult } from "./toast";
import { Pill } from "./ui";

const DIALOG = "m-auto w-[min(92vw,34rem)] border border-line bg-surface p-5 text-ink backdrop:bg-black/60 sm:p-6";

/** A person's photo or initials. A plain <img>: it can be a Google or GitHub picture. */
export function MemberAvatar({ name, url }: { name: string; url: string | null }) {
  if (!url) return <InitialsAvatar name={name} className="h-10 w-10 text-xs" />;
  // eslint-disable-next-line @next/next/no-img-element -- see above
  return <img src={url} alt="" referrerPolicy="no-referrer" className="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-accent" />;
}

/** A member's title, saved when the field is left or Enter is pressed. Escape puts it back. */
export function MemberTitleField({ memberId, name, title }: { memberId: string; name: string; title: string }) {
  const router = useRouter();
  const [value, setValue] = useState(title);
  const [pending, startTransition] = useTransition();

  function save() {
    const next = value.trim();
    if (next === title) return setValue(title);
    startTransition(async () => {
      const result = await setCoreMemberTitle(memberId, next);
      toastResult(result);
      if (result.status === "success") router.refresh();
      else setValue(title);
    });
  }

  return (
    <Input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") setValue(title);
      }}
      disabled={pending}
      maxLength={80}
      aria-label={`Title of ${name}`}
      className="py-1.5"
    />
  );
}

/** "New team", or the pencil on a team's card when `group` is given. */
export function CoreGroupButton({ group }: { group?: { id: string; name: string; description: string | null } }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [name, setName] = useState(group?.name ?? "");
  const [description, setDescription] = useState(group?.description ?? "");
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const result = await saveCoreGroup(group?.id ?? null, { name, description });
      if (result.status !== "success" && result.fieldErrors) toast("error", Object.values(result.fieldErrors)[0]);
      else toastResult(result);
      if (result.status !== "success") return;
      dialogRef.current?.close();
      if (!group) {
        setName("");
        setDescription("");
      }
      router.refresh();
    });
  }

  return (
    <>
      {group ? (
        <button
          type="button"
          title={`Edit ${group.name}`}
          aria-label={`Edit ${group.name}`}
          onClick={() => dialogRef.current?.showModal()}
          className="inline-flex h-8 w-8 items-center justify-center rounded-sm text-ink/65 hover:bg-ink/5 hover:text-ink"
        >
          <Pencil size={15} />
        </button>
      ) : (
        <Button type="button" size="sm" onClick={() => dialogRef.current?.showModal()}>
          <Plus size={15} /> New team
        </Button>
      )}
      <dialog ref={dialogRef} aria-labelledby={titleId} className={DIALOG}>
        <h2 id={titleId} className="font-serif text-xl">
          {group ? `Edit ${group.name}` : "New team"}
        </h2>
        <div className="mt-4 space-y-4">
          <div>
            <Label htmlFor={`${titleId}-name`}>Name</Label>
            <Input id={`${titleId}-name`} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="off" />
          </div>
          <div>
            <Label htmlFor={`${titleId}-about`}>Short description (optional)</Label>
            <Textarea id={`${titleId}-about`} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} rows={3} />
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <Button type="button" variant="secondary" size="sm" onClick={() => dialogRef.current?.close()}>
            Cancel
          </Button>
          <Button type="button" size="sm" loading={pending} disabled={name.trim().length < 2} onClick={save}>
            {group ? "Save" : "Create team"}
          </Button>
        </div>
      </dialog>
    </>
  );
}

/** Search existing website users, tick several, give them one title. The admin never types profile details. */
export function AddMembersButton({ groupId, groupName }: { groupId: string; groupName: string }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(0);
  const [q, setQ] = useState("");
  // null: nothing searched yet.
  const [results, setResults] = useState<CoreUserHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [problem, setProblem] = useState("");
  const [picked, setPicked] = useState<{ id: string; name: string }[]>([]);
  const [title, setTitle] = useState("");
  const [pending, startTransition] = useTransition();

  function reset() {
    if (timer.current) clearTimeout(timer.current);
    latest.current++;
    setQ("");
    setResults(null);
    setSearching(false);
    setProblem("");
    setPicked([]);
    setTitle("");
  }

  function onSearch(next: string) {
    setQ(next);
    if (timer.current) clearTimeout(timer.current);
    const ask = ++latest.current;
    if (next.trim().length < 2) {
      setResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    timer.current = setTimeout(async () => {
      const found = await searchCoreUsers(groupId, next.trim());
      // A slower, older answer never replaces a newer one.
      if (ask !== latest.current) return;
      setResults(found.results);
      setProblem(found.error ?? "");
      setSearching(false);
    }, 300);
  }

  function add() {
    startTransition(async () => {
      const result = await addCoreMembers(groupId, picked.map((p) => p.id), title);
      toastResult(result);
      if (result.status !== "success") return;
      dialogRef.current?.close();
      router.refresh();
    });
  }

  const isPicked = (id: string) => picked.some((p) => p.id === id);
  const toggle = (hit: CoreUserHit) =>
    setPicked((now) => (now.some((p) => p.id === hit.id) ? now.filter((p) => p.id !== hit.id) : [...now, { id: hit.id, name: hit.full_name }]));

  return (
    <>
      <Button type="button" size="sm" onClick={() => dialogRef.current?.showModal()}>
        <UserPlus size={15} /> Add members
      </Button>
      <dialog ref={dialogRef} aria-labelledby={titleId} onClose={reset} className={DIALOG}>
        <h2 id={titleId} className="font-serif text-xl">
          Add members to {groupName}
        </h2>
        <label className="mt-4 block text-sm font-medium text-ink">
          Search website users by name or email
          <Input type="search" value={q} onChange={(e) => onSearch(e.target.value)} autoComplete="off" placeholder="Name or email" className="mt-1.5 font-normal" />
        </label>

        <div aria-live="polite" className="mt-3 max-h-[40vh] min-h-24 overflow-y-auto border border-line">
          {problem ? (
            <p className="p-4 text-sm text-red-600">{problem}</p>
          ) : searching && !results ? (
            <p className="p-4 text-sm text-ink/60">Searching…</p>
          ) : !results ? (
            <p className="p-4 text-sm text-ink/60">Type at least 2 letters. Up to 20 people are shown.</p>
          ) : results.length === 0 ? (
            <p className="p-4 text-sm text-ink/75">Not found. Ask them to sign up at fxscriet.com first.</p>
          ) : (
            <ul className="divide-y divide-line">
              {results.map((hit) => (
                <li key={hit.id}>
                  <label className={`flex items-center gap-3 p-3 ${hit.already_added ? "opacity-70" : "cursor-pointer hover:bg-ink/5"}`}>
                    <input
                      type="checkbox"
                      checked={hit.already_added || isPicked(hit.id)}
                      disabled={hit.already_added}
                      onChange={() => toggle(hit)}
                      className="h-4 w-4 shrink-0 accent-accent"
                    />
                    <MemberAvatar name={hit.full_name} url={hit.avatar_url} />
                    <span className="min-w-0 flex-1 text-sm">
                      <span className="block truncate font-medium text-ink">{hit.full_name}</span>
                      <span className="block truncate text-xs text-ink/65">{hit.email}</span>
                      {memberDetail(hit) && <span className="block truncate text-xs text-ink/65">{memberDetail(hit)}</span>}
                    </span>
                    {hit.already_added && <Pill>Added</Pill>}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>

        {picked.length > 0 && (
          <p className="mt-3 text-sm text-ink/75">
            <span className="font-medium text-ink">Selected:</span> {picked.map((p) => p.name).join(", ")}
          </p>
        )}

        <label className="mt-4 block text-sm font-medium text-ink">
          Title for everyone selected (optional)
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} autoComplete="off" placeholder="Member" className="mt-1.5 font-normal" />
        </label>

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <Button type="button" variant="secondary" size="sm" onClick={() => dialogRef.current?.close()}>
            Cancel
          </Button>
          <Button type="button" size="sm" loading={pending} disabled={picked.length === 0} onClick={add}>
            {picked.length > 1 ? `Add ${picked.length} people` : "Add"}
          </Button>
        </div>
      </dialog>
    </>
  );
}

/** A hub's selected or accepted candidates who are not members yet; the chosen ones join as "Member". */
export function RecruitmentCandidatesButton({ groupId, groupName }: { groupId: string; groupName: string }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [people, setPeople] = useState<CoreCandidate[] | null>(null);
  const [problem, setProblem] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  async function open() {
    setPeople(null);
    setProblem("");
    setChosen([]);
    dialogRef.current?.showModal();
    const found = await listCoreCandidates(groupId);
    setPeople(found.results);
    setProblem(found.error ?? "");
  }

  function add() {
    startTransition(async () => {
      const result = await addCoreMembers(groupId, chosen, "Member");
      toastResult(result);
      if (result.status !== "success") return;
      dialogRef.current?.close();
      router.refresh();
    });
  }

  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={open}>
        <Users size={15} /> Add selected candidates from recruitment
      </Button>
      <dialog ref={dialogRef} aria-labelledby={titleId} className={DIALOG}>
        <h2 id={titleId} className="font-serif text-xl">
          Selected in {groupName}
        </h2>
        <p className="mt-1 text-sm text-ink/70">People selected or accepted in this hub who are not members yet. They join as &ldquo;Member&rdquo;.</p>
        <div aria-live="polite" className="mt-3 max-h-[45vh] min-h-24 overflow-y-auto border border-line">
          {problem ? (
            <p className="p-4 text-sm text-red-600">{problem}</p>
          ) : !people ? (
            <p className="p-4 text-sm text-ink/60">Loading…</p>
          ) : people.length === 0 ? (
            <p className="p-4 text-sm text-ink/75">Nobody to add. Either everyone is already a member, or this hub&rsquo;s results are not out yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {people.map((person) => (
                <li key={person.user_id}>
                  <label className="flex cursor-pointer items-center gap-3 p-3 hover:bg-ink/5">
                    <input
                      type="checkbox"
                      checked={chosen.includes(person.user_id)}
                      onChange={(e) => setChosen((now) => (e.target.checked ? [...now, person.user_id] : now.filter((id) => id !== person.user_id)))}
                      className="h-4 w-4 shrink-0 accent-accent"
                    />
                    <span className="min-w-0 flex-1 text-sm">
                      <span className="block truncate font-medium text-ink">{person.full_name}</span>
                      <span className="block truncate text-xs text-ink/65">{person.email}</span>
                    </span>
                    <Pill tone={person.offer_status === "accepted" ? "good" : "neutral"}>{person.offer_status === "accepted" ? "Accepted" : "Selected"}</Pill>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <Button type="button" variant="secondary" size="sm" onClick={() => dialogRef.current?.close()}>
            Close
          </Button>
          <Button type="button" size="sm" loading={pending} disabled={chosen.length === 0} onClick={add}>
            {chosen.length > 1 ? `Add ${chosen.length} people` : "Add"}
          </Button>
        </div>
      </dialog>
    </>
  );
}

/** Who decides what shows for a Core member: admins, here. */
export function CoreMemberSwitches({ userId, name, profile, contact, core }: { userId: string; name: string; profile: boolean; contact: boolean; core: boolean }) {
  const router = useRouter();
  const [values, setValues] = useState({ profile, contact, core });
  const [pending, startTransition] = useTransition();
  const flip = (key: keyof typeof values) => {
    const next = { ...values, [key]: !values[key] };
    setValues(next);
    startTransition(async () => {
      const result = await setCoreMemberVisibility(userId, next);
      if (result.status !== "success") {
        setValues(values);
        toastResult(result);
      }
      router.refresh();
    });
  };
  const SWITCHES = [
    ["profile", "Profile visible"],
    ["contact", "Links shown"],
    ["core", "On Core page"],
  ] as const;
  return (
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5" data-switches={name}>
      {SWITCHES.map(([key, label]) => (
        <button
          key={key}
          type="button"
          role="switch"
          aria-checked={values[key]}
          aria-label={`${label}: ${name}`}
          disabled={pending}
          onClick={() => flip(key)}
          className="inline-flex items-center gap-1.5 text-xs text-ink/75 disabled:opacity-60"
        >
          <span className={`relative inline-block h-4 w-7 rounded-full transition-colors ${values[key] ? "bg-accent" : "bg-ink/25"}`}>
            <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${values[key] ? "left-3.5" : "left-0.5"}`} />
          </span>
          {label}
        </button>
      ))}
    </div>
  );
}
