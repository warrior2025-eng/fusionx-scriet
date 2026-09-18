// Hand-maintained types mirroring supabase/migrations/0001_core_schema.sql.
// If you have the Supabase CLI linked to a project, prefer generating this
// file instead: `supabase gen types typescript --linked > types/database.ts`

export type AppRole = "super_admin" | "admin" | "editor" | "faculty" | "mentor" | "member";

export type MembershipType = "general" | "project" | "research" | "core_team" | "mentor" | "alumni";

export type ProjectStatus = "idea" | "building" | "prototype" | "testing" | "completed" | "continued";

export type ResearchStatus = "idea" | "researching" | "experimentation" | "draft" | "submitted" | "published";

export type IpStatus = "not_applicable" | "exploring" | "prior_art_review" | "documentation" | "filed" | "granted";

export type TeamStatus = "forming" | "active" | "completed" | "archived";

export type OpportunityCategory =
  | "hackathon"
  | "competition"
  | "research"
  | "internship"
  | "workshop"
  | "scholarship"
  | "conference"
  | "innovation_challenge";

export type OpportunityStatus = "open" | "closing_soon" | "closed";

export type EventStatus = "upcoming" | "live" | "completed";

export type ApplicationStatus = "submitted" | "under_review" | "shortlisted" | "selected" | "rejected" | "archived";

export type AnnouncementStatus = "draft" | "published" | "archived";

export type InstitutionalApprovalStatus =
  | "faculty_guide_confirmed"
  | "director_review_pending"
  | "officially_approved";

export interface OrganizationSettings {
  id: true;
  org_name: string;
  chapter_name: string;
  tagline: string;
  secondary_tagline: string;
  faculty_guide_name: string;
  faculty_guide_title: string;
  institutional_approval: InstitutionalApprovalStatus;
  official_email: string | null;
  instagram_url: string | null;
  linkedin_url: string | null;
  github_url: string | null;
  announcement_banner: string | null;
  announcement_banner_active: boolean;
  updated_at: string;
  updated_by: string | null;
}

export interface Profile {
  id: string;
  full_name: string;
  department: string | null;
  year: string | null;
  bio: string | null;
  skills: string[];
  interests: string[];
  portfolio_url: string | null;
  github_url: string | null;
  linkedin_url: string | null;
  avatar_url: string | null;
  membership_type: MembershipType;
  is_profile_public: boolean;
  is_contact_public: boolean;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  title: string;
  slug: string;
  description: string;
  domain: string | null;
  status: ProjectStatus;
  technologies: string[];
  owner_id: string;
  github_url: string | null;
  demo_url: string | null;
  image_path: string | null;
  research_status_note: string | null;
  ip_status: IpStatus;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface ResearchEntry {
  id: string;
  title: string;
  abstract: string;
  domain: string | null;
  status: ResearchStatus;
  publication_info: string | null;
  document_url: string | null;
  project_id: string | null;
  created_by: string;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface Team {
  id: string;
  name: string;
  description: string | null;
  project_id: string | null;
  skills_needed: string[];
  status: TeamStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface Opportunity {
  id: string;
  title: string;
  organizer: string;
  category: OpportunityCategory;
  description: string;
  eligibility: string | null;
  deadline: string | null;
  registration_url: string | null;
  status: OpportunityStatus;
  is_published: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface FusionEvent {
  id: string;
  title: string;
  description: string;
  event_date: string;
  event_time: string | null;
  venue: string | null;
  organizer: string | null;
  registration_url: string | null;
  registration_capacity: number | null;
  status: EventStatus;
  poster_path: string | null;
  is_published: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  category: string | null;
  author_id: string;
  status: AnnouncementStatus;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Application {
  id: string;
  user_id: string | null;
  full_name: string;
  college_email: string;
  department: string;
  year: string;
  skills: string[];
  interests: string[];
  portfolio_url: string | null;
  github_url: string | null;
  linkedin_url: string | null;
  preferred_functional_area: string;
  project_interests: string | null;
  research_interests: string | null;
  motivation: string;
  status: ApplicationStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  created_at: string;
}

export interface Mentor {
  id: string;
  user_id: string | null;
  name: string;
  role_title: string;
  expertise: string[];
  experience: string | null;
  linkedin_url: string | null;
  availability: string | null;
  bio: string | null;
  is_published: boolean;
  created_by: string;
  created_at: string;
}

export interface Resource {
  id: string;
  title: string;
  description: string | null;
  category: string;
  url: string | null;
  file_path: string | null;
  author_id: string | null;
  visibility: "public" | "members";
  is_published: boolean;
  created_at: string;
}

