import Link from "next/link";
import { BellRing, CalendarPlus, ChevronDown, ChevronUp, Eye, EyeOff, Trash2 } from "lucide-react";
import {
  deleteCoreGroup,
  moveCoreGroup,
  moveCoreMember,
  remindCoreMembers,
  removeCoreMember,
  setCoreGroupVisible,
  setCoreMemberLead,
  setCoreMemberVisible,
} from "@/actions/admin-core-teams";
import { requireCapability, type AdminContext } from "@/lib/admin/guard";
import { LinkButton } from "@/components/ui/button";
import { cn, memberDetail } from "@/lib/utils";
import { ActionButton } from "./action-button";
import { AddMembersButton, CoreGroupButton, MemberAvatar, MemberTitleField, RecruitmentCandidatesButton } from "./core-team-dialogs";
import { AdminPage, Pill } from "./ui";

const TABS = [
  { key: "sections", href: "/admin/team", label: "Website sections" },
  { key: "teams", href: "/admin/team?tab=teams", label: "Teams" },
] as const;

export function CoreTabs({ current }: { current: (typeof TABS)[number]["key"] }) {
  return (
    <nav aria-label="Core sections" className="mb-6 flex flex-wrap gap-x-6 gap-y-1 border-b border-line">
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          aria-current={tab.key === current ? "page" : undefined}
          className={cn("border-b-2 px-1 pb-2 text-sm font-medium", tab.key === current ? "border-accent text-ink" : "border-transparent text-ink/65 hover:text-ink")}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}

type Group = { id: string; name: string; description: string | null; kind: "core" | "hub" | "custom"; is_visible: boolean };
type Member = {
  member_id: string;
  group_id: string;
  user_id: string;
  title: string;
  is_lead: boolean;
  is_visible: boolean;
  full_name: string;
  email: string;
  avatar_url: string | null;
  department: string | null;
  year: string | null;
  incomplete: boolean;
  show_on_core: boolean;
  is_active: boolean;
  last_reminded_at: string | null;
  /** Reminded in the last 24 hours, so the button is off until then. */
  reminded: boolean;
};

const KIND_LABEL = { core: "Core", hub: "Hub", custom: "Custom" } as const;

async function loadTeams(ctx: AdminContext) {
  const [groups, members] = await Promise.all([
    ctx.supabase.from("core_groups").select("id, name, description, kind, is_visible").order("display_order").order("created_at"),
    ctx.supabase.rpc("admin_core_members"),
  ]);
  const since = Date.now() - 24 * 60 * 60 * 1000;
  return {
    failed: Boolean(groups.error || members.error),
    groups: (groups.data ?? []) as Group[],
    members: ((members.data ?? []) as Omit<Member, "reminded">[]).map((m) => ({
      ...m,
      reminded: Boolean(m.last_reminded_at && new Date(m.last_reminded_at).getTime() > since),
    })),
  };
}

/** The Teams tab of Core. */
export async function CoreTeamsPage() {
  const ctx = await requireCapability("team", "/admin/team?tab=teams");
  const { failed, groups, members } = await loadTeams(ctx);

  return (
    <AdminPage
      title="Core"
      description="FusionX Core, the hubs and any other team, made of people who already have a website account. You pick the person and their title. The photo, bio and links come from their own profile."
      crumbs={[{ label: "Core" }]}
      actions={<CoreGroupButton />}
    >
      <CoreTabs current="teams" />
      {failed && (
        <p role="alert" className="mb-4 border border-red-500/40 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-600">
          The teams could not be loaded. If migration 0031 has not been run yet, run it and reload.
        </p>
      )}
      <div className="space-y-6">
        {groups.map((group, i) => (
          <TeamCard key={group.id} group={group} members={members.filter((m) => m.group_id === group.id)} first={i === 0} last={i === groups.length - 1} />
        ))}
      </div>
    </AdminPage>
  );
}

function TeamCard({ group, members, first, last }: { group: Group; members: Member[]; first: boolean; last: boolean }) {
  const toRemind = members.some((m) => m.incomplete && m.is_active && !m.reminded);
  return (
    <section aria-labelledby={`team-${group.id}`} className="border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id={`team-${group.id}`} className="font-serif text-xl text-ink">
              {group.name}
            </h2>
            <Pill>{KIND_LABEL[group.kind]}</Pill>
            {!group.is_visible && <Pill tone="warn">Hidden</Pill>}
          </div>
          {group.description && <p className="mt-1 max-w-2xl text-sm text-ink/65">{group.description}</p>}
        </div>
        <div className="flex items-center gap-0.5">
          <ActionButton bare title={`Move ${group.name} up`} disabled={first} action={moveCoreGroup.bind(null, group.id, "up")}>
            <ChevronUp size={16} />
          </ActionButton>
          <ActionButton bare title={`Move ${group.name} down`} disabled={last} action={moveCoreGroup.bind(null, group.id, "down")}>
            <ChevronDown size={16} />
          </ActionButton>
          <ActionButton
            bare
            title={group.is_visible ? `Hide ${group.name} from the website` : `Show ${group.name} on the website`}
            action={setCoreGroupVisible.bind(null, group.id, !group.is_visible)}
          >
            {group.is_visible ? <EyeOff size={16} /> : <Eye size={16} />}
          </ActionButton>
          <CoreGroupButton group={group} />
          {group.kind === "custom" && (
            <ActionButton
              bare
              danger
              title={`Delete ${group.name}`}
              action={deleteCoreGroup.bind(null, group.id)}
              confirm={{
                title: "Delete this team?",
                body: `"${group.name}" and its member list will be removed. Their profiles stay as they are. This can't be undone.`,
                confirmLabel: "Delete",
              }}
            >
              <Trash2 size={15} />
            </ActionButton>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <AddMembersButton groupId={group.id} groupName={group.name} />
        {group.kind === "hub" && <RecruitmentCandidatesButton groupId={group.id} groupName={group.name} />}
        <LinkButton href={`/admin/meetings/new?team=${group.id}`} variant="secondary" size="sm">
          <CalendarPlus size={15} aria-hidden /> Schedule a meeting with this team
        </LinkButton>
        {toRemind && (
          <ActionButton action={remindCoreMembers.bind(null, group.id, null)}>
            <BellRing size={15} /> Remind all incomplete
          </ActionButton>
        )}
      </div>

      {members.length === 0 ? (
        <p className="mt-4 border-t border-line pt-4 text-sm text-ink/60">No members yet. This team does not show on the website until it has one.</p>
      ) : (
        <ul className="mt-4 divide-y divide-line border-t border-line">
          {members.map((member) => (
            <MemberRow key={member.member_id} member={member} peers={members.filter((m) => m.is_lead === member.is_lead)} />
          ))}
        </ul>
      )}
    </section>
  );
}

function MemberRow({ member, peers }: { member: Member; peers: Member[] }) {
  const id = member.member_id;
  const name = member.full_name;
  const place = peers.findIndex((m) => m.member_id === id);
  const detail = memberDetail(member);
  return (
    <li className="grid gap-3 py-3 md:grid-cols-[minmax(0,1fr)_13rem_auto] md:items-center xl:grid-cols-[minmax(0,1fr)_13rem_21.5rem]">
      <div className="flex min-w-0 items-start gap-3">
        <MemberAvatar name={name} url={member.avatar_url} />
        <div className="min-w-0 text-sm">
          <p className="font-medium text-ink">{name}</p>
          {detail && <p className="text-xs text-ink/65">{detail}</p>}
          <p className="break-all text-xs text-ink/65">{member.email}</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {member.is_lead && <Pill tone="good">Lead</Pill>}
            {member.incomplete && (
              <Pill tone="warn">
                <span className="normal-case">Profile incomplete</span>
              </Pill>
            )}
            {!member.is_visible && <Pill>Hidden</Pill>}
            {!member.show_on_core && (
              <Pill>
                <span className="normal-case">Turned off by them</span>
              </Pill>
            )}
            {!member.is_active && <Pill tone="bad">Deactivated</Pill>}
          </div>
        </div>
      </div>
      <MemberTitleField key={member.title} memberId={id} name={name} title={member.title} />
      <div className="flex flex-wrap items-center gap-1 md:justify-end">
        {member.incomplete && member.is_active && (
          <ActionButton
            title={member.reminded ? "Already reminded in the last 24 hours" : `Remind ${name} to complete their profile`}
            disabled={member.reminded}
            action={remindCoreMembers.bind(null, member.group_id, member.user_id)}
          >
            Remind
          </ActionButton>
        )}
        <ActionButton title={member.is_lead ? `Remove lead from ${name}` : `Make ${name} a lead`} action={setCoreMemberLead.bind(null, id, !member.is_lead)}>
          {member.is_lead ? "Remove lead" : "Make lead"}
        </ActionButton>
        <ActionButton bare title={`Move ${name} up`} disabled={place === 0} action={moveCoreMember.bind(null, id, "up")}>
          <ChevronUp size={16} />
        </ActionButton>
        <ActionButton bare title={`Move ${name} down`} disabled={place === peers.length - 1} action={moveCoreMember.bind(null, id, "down")}>
          <ChevronDown size={16} />
        </ActionButton>
        <ActionButton bare title={member.is_visible ? `Hide ${name} from this team` : `Show ${name} in this team`} action={setCoreMemberVisible.bind(null, id, !member.is_visible)}>
          {member.is_visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </ActionButton>
        <ActionButton
          bare
          danger
          title={`Remove ${name} from this team`}
          action={removeCoreMember.bind(null, id)}
          confirm={{ title: "Remove from this team?", body: `${name} will no longer be listed in this team. Their profile and other teams stay as they are.`, confirmLabel: "Remove" }}
        >
          <Trash2 size={15} />
        </ActionButton>
      </div>
    </li>
  );
}
