import { z } from "zod";
import { functionalAreas } from "@/lib/site-config";
import { linkField } from "@/lib/validation/link";

export const joinApplicationSchema = z.object({
  full_name: z.string().trim().min(2, "Enter your full name").max(120),
  college_email: z.string().trim().email("Enter a valid email address").max(200),
  department: z.string().trim().min(2, "Enter your department").max(120),
  year: z.string().trim().min(1, "Select your year").max(20),
  skills: z.array(z.string()).max(20).default([]),
  interests: z.array(z.string()).max(20).default([]),
  portfolio_url: linkField("Portfolio", "website"),
  github_url: linkField("GitHub", "github"),
  linkedin_url: linkField("LinkedIn", "linkedin"),
  preferred_functional_area: z.enum(functionalAreas),
  project_interests: z.string().trim().max(1000).optional().or(z.literal("")),
  research_interests: z.string().trim().max(1000).optional().or(z.literal("")),
  motivation: z.string().trim().min(30, "Tell us a bit more (at least 30 characters)").max(2000),
  // Honeypot field — real users never fill this in; bots often do.
  website: z.string().max(0, "Spam detected").optional().or(z.literal("")),
});

export type JoinApplicationInput = z.infer<typeof joinApplicationSchema>;

export const contactMessageSchema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(120),
  email: z.string().trim().email("Enter a valid email address").max(200),
  subject: z.string().trim().min(3, "Enter a subject").max(200),
  message: z.string().trim().min(10, "Message is too short").max(3000),
  website: z.string().max(0, "Spam detected").optional().or(z.literal("")),
});

export type ContactMessageInput = z.infer<typeof contactMessageSchema>;

export const signUpSchema = z
  .object({
    full_name: z.string().trim().min(2, "Enter your full name").max(120),
    email: z.string().trim().email("Enter a valid email address"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirm_password: z.string(),
  })
  .refine((data) => data.password === data.confirm_password, {
    message: "Passwords do not match",
    path: ["confirm_password"],
  });

export const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});

export const projectSchema = z.object({
  title: z.string().trim().min(3, "Title is too short").max(160, "Keep the title under 160 characters"),
  description: z.string().trim().min(20, "Add a fuller description (at least 20 characters)").max(4000, "Keep the description under 4000 characters"),
  domain: z.string().trim().max(80, "Too long (max 80 characters).").optional().or(z.literal("")),
  status: z.enum(["idea", "building", "prototype", "testing", "completed", "continued"]),
  technologies: z.string().trim().max(300, "Too long (max 300 characters).").optional().or(z.literal("")),
  github_url: linkField("GitHub URL", "github"),
  demo_url: linkField("Demo URL", "any"),
  is_published: z.union([z.literal("on"), z.undefined()]).optional(),
});

export const researchSchema = z.object({
  title: z.string().trim().min(3, "Title is too short").max(200, "Keep the title under 200 characters"),
  abstract: z.string().trim().min(30, "Add a fuller abstract (at least 30 characters)").max(4000, "Keep the abstract under 4000 characters"),
  domain: z.string().trim().max(80, "Too long (max 80 characters).").optional().or(z.literal("")),
  status: z.enum(["idea", "researching", "experimentation", "draft", "submitted", "published"]),
  publication_info: z.string().trim().max(300, "Too long (max 300 characters).").optional().or(z.literal("")),
  document_url: linkField("Document link", "any"),
  is_published: z.union([z.literal("on"), z.undefined()]).optional(),
});
