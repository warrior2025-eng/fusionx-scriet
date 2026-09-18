import { z } from "zod";
import { functionalAreas } from "@/lib/site-config";

export const joinApplicationSchema = z.object({
  full_name: z.string().trim().min(2, "Enter your full name").max(120),
  college_email: z.string().trim().email("Enter a valid email address").max(200),
  department: z.string().trim().min(2, "Enter your department").max(120),
  year: z.string().trim().min(1, "Select your year").max(20),
  skills: z.array(z.string()).max(20).default([]),
  interests: z.array(z.string()).max(20).default([]),
  portfolio_url: z.string().trim().url().optional().or(z.literal("")),
  github_url: z.string().trim().url().optional().or(z.literal("")),
  linkedin_url: z.string().trim().url().optional().or(z.literal("")),
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
