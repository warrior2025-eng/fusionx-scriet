import { Sparkles, Terminal, Flame, Cpu, Rocket, Award, ShieldCheck, Zap } from "lucide-react";

interface MarqueeItem {
  icon: React.ReactNode;
  label: string;
  tag?: string;
}

const defaultItems: MarqueeItem[] = [
  { icon: <Zap size={14} className="text-cyan-400" />, label: "NATIONAL HACKATHONS", tag: "COMPETE" },
  { icon: <Cpu size={14} className="text-blue-400" />, label: "AI & DEEP TECH LABS", tag: "BUILD" },
  { icon: <ShieldCheck size={14} className="text-emerald-400" />, label: "PATENTS & IPR FILING", tag: "RESEARCH" },
  { icon: <Rocket size={14} className="text-purple-400" />, label: "STUDENT VENTURE CELL", tag: "LAUNCH" },
  { icon: <Terminal size={14} className="text-cyan-400" />, label: "OPEN SOURCE PROTOCOLS", tag: "DEV" },
  { icon: <Award size={14} className="text-amber-400" />, label: "RESEARCH SYMPOSIUM", tag: "IMPACT" },
  { icon: <Flame size={14} className="text-rose-400" />, label: "INNOVATION ACCELERATOR", tag: "SCALE" },
  { icon: <Sparkles size={14} className="text-blue-400" />, label: "INTERDISCIPLINARY TEAMS", tag: "FUSION" },
];

export function TechMarquee({ items = defaultItems }: { items?: MarqueeItem[] }) {
  // We duplicate the items array so it seamlessly loops indefinitely
  const repeated = [...items, ...items, ...items];

  return (
    <div className="relative w-full overflow-hidden border-y border-ink/10 bg-[#070b14]/80 backdrop-blur-md py-3 select-none">
      {/* Side gradient fade masks */}
      <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-paper to-transparent z-10" />
      <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-paper to-transparent z-10" />

      <div className="animate-marquee flex items-center gap-8 text-xs font-mono tracking-wider uppercase text-ink/70">
        {repeated.map((item, idx) => (
          <div
            key={idx}
            className="flex items-center gap-2.5 px-3 py-1 rounded-full border border-ink/10 bg-surface/50 hover:border-accent/40 transition-colors"
          >
            {item.icon}
            <span className="font-semibold text-ink/90">{item.label}</span>
            {item.tag && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/20 text-accent font-bold tracking-widest">
                {item.tag}
              </span>
            )}
            <span className="text-ink/20 ml-2">✦</span>
          </div>
        ))}
      </div>
    </div>
  );
}
