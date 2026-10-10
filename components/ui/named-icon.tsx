import {
  BookOpen,
  Briefcase,
  Cpu,
  FlaskConical,
  GraduationCap,
  Hammer,
  Lightbulb,
  Network,
  Rocket,
  Search,
  Shield,
  Sparkles,
  Target,
  Trophy,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { IconName } from "@/lib/site-content/schema";

const ICONS: Record<IconName, LucideIcon> = {
  Hammer,
  FlaskConical,
  Users,
  Trophy,
  Sparkles,
  Lightbulb,
  Rocket,
  BookOpen,
  Shield,
  Briefcase,
  Target,
  Cpu,
  Network,
  GraduationCap,
  Wrench,
  Search,
};

/** An icon chosen by name in the admin panel. Renders nothing for an unknown name. */
export function NamedIcon({ name, size = 18, className }: { name: string | null | undefined; size?: number; className?: string }) {
  const Icon = name ? ICONS[name as IconName] : undefined;
  return Icon ? <Icon size={size} className={className} aria-hidden /> : null;
}
