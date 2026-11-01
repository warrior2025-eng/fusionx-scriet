import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** "Department · Year", leaving out whichever is empty. */
export function memberDetail(person: { department: string | null; year: string | null }): string {
  return [person.department, person.year].filter(Boolean).join(" · ");
}
