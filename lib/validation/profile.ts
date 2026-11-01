import { z } from "zod";
import { linkField } from "./link";

export const BIO_MAX = 600;

// A browser sends a line break in a text box as two characters, so a bio that fits on the
// screen could be too long on arrival. One line break is one character, everywhere.
const oneLineBreak = (value: string) => value.replace(/\r\n?/g, "\n").trim();

/** The rules for /profile, on the page and on the server. Links come out fixed. */
export const profileSchema = z.object({
  full_name: z.string().trim().min(2, "Enter your full name (at least 2 letters).").max(120, "Name is too long (max 120)."),
  department: z.string().trim().max(120, "Too long (max 120 characters)."),
  year: z.string().trim().max(20, "Too long (max 20 characters)."),
  bio: z
    .string()
    .transform(oneLineBreak)
    .refine((value) => value.length <= BIO_MAX, { error: (issue) => `Bio is too long: ${String(issue.input).length}/${BIO_MAX} characters. Please shorten it.` }),
  skills: z.string().trim().max(300, "Too long (max 300 characters)."),
  interests: z.string().trim().max(300, "Too long (max 300 characters)."),
  portfolio_url: linkField("Portfolio", "website"),
  github_url: linkField("GitHub", "github"),
  linkedin_url: linkField("LinkedIn", "linkedin"),
});

/** "Frontend, AI/ML" or one per line: the list as saved. */
export const tagList = (value: string) => value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean);

export const bioLength = (value: string) => oneLineBreak(value).length;
