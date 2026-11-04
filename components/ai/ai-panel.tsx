"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, Send, X } from "lucide-react";
import { SlashMark } from "@/components/ui/slash-mark";
import { cn } from "@/lib/utils";
import { AiText } from "./ai-text";
import type { AiLauncherProps } from "./ai-launcher";

type Message = { role: "user" | "assistant"; text: string };
const STORE = "fx-ai-chat";
const ID_KEY = "fx-ai-id";
const MAX = 500;

const store = {
  read(): Message[] {
    try {
      const v = JSON.parse(sessionStorage.getItem(STORE) || "[]");
      return Array.isArray(v) ? v.slice(-30) : [];
    } catch {
      return [];
    }
  },
  write(messages: Message[]) {
    try {
      sessionStorage.setItem(STORE, JSON.stringify(messages.slice(-30)));
    } catch {}
  },
  clear() {
    try {
      sessionStorage.removeItem(STORE);
    } catch {}
  },
};

/** An anonymous id for the visitor's limit, kept in this browser only. */
function visitorId(): string | undefined {
  try {
    let id = localStorage.getItem(ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(ID_KEY, id);
    }
    return id;
  } catch {
    return undefined;
  }
}

/**
 * The FusionX AI panel: a cut-corner card on laptops, a full-screen sheet on phones.
 * Focus stays inside while it is open; Esc closes it, and closing clears the chat.
 */
export default function AiPanel({ welcome, suggestions, allowed, onClose }: AiLauncherProps & { onClose: () => void }) {
  const [messages, setMessages] = useState<Message[]>(() => store.read());
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);
  const [announce, setAnnounce] = useState("");
  const panel = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const list = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    store.clear();
    onClose();
  }, [onClose]);

  useEffect(() => {
    input.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
      if (e.key !== "Tab" || !panel.current) return;
      const items = [...panel.current.querySelectorAll<HTMLElement>("button, a[href], textarea, [tabindex]:not([tabindex='-1'])")].filter((el) => !el.hasAttribute("disabled"));
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    // On phones the sheet covers the page: the page behind does not scroll.
    const before = document.documentElement.style.overflow;
    if (window.matchMedia("(max-width: 639px)").matches) document.documentElement.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = before;
    };
  }, [close]);

  useEffect(() => {
    store.write(messages);
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [messages]);

  const ask = async (question: string) => {
    const q = question.trim().slice(0, MAX);
    if (!q || busy) return;
    const history = messages.slice(-6);
    setMessages((m) => [...m, { role: "user", text: q }, { role: "assistant", text: "" }]);
    setText("");
    setBusy(true);
    let answer = "";
    const show = (t: string) => setMessages((m) => [...m.slice(0, -1), { role: "assistant", text: t }]);
    try {
      const res = await fetch("/api/fusionx-ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: q, history, id: visitorId() }) });
      if (!res.ok || !res.body) {
        const problem = (await res.json().catch(() => null)) as { error?: string } | null;
        answer = problem?.error ?? "FusionX AI is resting right now. Try again later or email network@fxscriet.com.";
        show(answer);
      } else {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          answer += decoder.decode(value, { stream: true });
          show(answer);
        }
      }
    } catch {
      answer = "That didn't go through. Check your connection and try again.";
      show(answer);
    }
    setBusy(false);
    setAnnounce(answer.slice(0, 600));
    input.current?.focus();
  };

  const copy = async (i: number, t: string) => {
    try {
      await navigator.clipboard.writeText(t);
      setCopied(i);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {}
  };

  return (
    <div className="fixed inset-0 z-[60] sm:inset-auto sm:bottom-6 sm:right-6" role="presentation">
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="fx-ai-title"
        className="ai-panel cut-corner flex h-[100dvh] w-full flex-col text-ink shadow-2xl sm:h-[min(560px,calc(100dvh-3rem))] sm:w-[380px]"
        data-ai-panel
      >
        <header className="flex items-start gap-3 border-b border-line px-4 py-3">
          <span className="ai-tile mt-0.5 grid h-8 w-8 shrink-0 place-items-center bg-[#00030D]">
            {/* eslint-disable-next-line @next/next/no-img-element -- the small logo mark */}
            <img src="/logo-mark.png" alt="" width={20} height={20} className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="fx-ai-title" className="flex items-center gap-1.5 font-semibold leading-tight text-ink">
              FusionX AI <SlashMark className="text-[0.8em]" />
            </h2>
            <p className="text-xs text-ink/65">Your guide to everything FusionX</p>
          </div>
          <button type="button" onClick={close} aria-label="Close FusionX AI" className="rounded-sm p-1.5 text-ink/70 hover:bg-ink/5 hover:text-ink">
            <X size={18} aria-hidden />
          </button>
        </header>

        <div ref={list} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 text-sm leading-relaxed" data-ai-messages>
          <div className="max-w-[90%] rounded-sm bg-ink/[0.05] px-3 py-2 text-ink">{welcome}</div>
          {messages.length === 0 && (
            <div className="flex flex-wrap gap-2" aria-label="Suggested questions">
              {suggestions.slice(0, 6).map((s) => (
                <button key={s} type="button" onClick={() => void ask(s)} className="rounded-full border border-accent/50 px-3 py-1 text-xs font-medium text-accent-text hover:bg-accent/10" data-ai-chip>
                  {s}
                </button>
              ))}
            </div>
          )}
          {messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="ml-auto w-fit max-w-[85%] whitespace-pre-wrap break-words rounded-sm bg-[#004df6] px-3 py-2 text-white" data-ai-user>
                {m.text}
              </div>
            ) : (
              <div key={i} className="max-w-[92%]" data-ai-answer>
                <div className="rounded-sm bg-ink/[0.05] px-3 py-2 text-ink">
                  {m.text ? (
                    <AiText text={m.text} allowed={allowed} />
                  ) : (
                    <span className="ai-typing inline-flex gap-1 py-1" aria-label="FusionX AI is typing">
                      <span />
                      <span />
                      <span />
                    </span>
                  )}
                </div>
                {m.text && !(busy && i === messages.length - 1) && (
                  <button type="button" onClick={() => void copy(i, m.text)} className="mt-1 inline-flex items-center gap-1 text-xs text-ink/60 hover:text-ink">
                    {copied === i ? <Check size={12} aria-hidden /> : <Copy size={12} aria-hidden />} {copied === i ? "Copied" : "Copy"}
                  </button>
                )}
              </div>
            ),
          )}
        </div>
        <p className="sr-only" aria-live="polite">
          {announce}
        </p>

        <form
          className="border-t border-line px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            void ask(text);
          }}
        >
          <div className="flex items-end gap-2">
            <label htmlFor="fx-ai-input" className="sr-only">
              Your question about FusionX
            </label>
            <textarea
              id="fx-ai-input"
              ref={input}
              rows={1}
              value={text}
              maxLength={MAX}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void ask(text);
                }
              }}
              placeholder="Ask about FusionX…"
              className="max-h-28 min-h-10 flex-1 resize-none border border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink/45 focus:border-accent focus:outline-none"
            />
            <button type="submit" disabled={busy || !text.trim()} aria-label="Send" className={cn("grid h-10 w-10 shrink-0 place-items-center bg-[#004df6] text-white", (busy || !text.trim()) && "opacity-50")}>
              <Send size={16} aria-hidden />
            </button>
          </div>
          <p className="mt-2 text-[11px] leading-snug text-ink/60">
            AI can make mistakes. For official details, see the pages linked or email network@fxscriet.com. Don&rsquo;t share personal information.
            {text.length > MAX - 80 && <span className="ml-1 tabular-nums">{text.length}/{MAX}</span>}
          </p>
        </form>
      </div>
    </div>
  );
}
