import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AskQuestionInput, ChatErrorCode, ChatEvent } from "@/domain/advisor";
import { recommend, type Recommendation } from "@/domain/engine";
import { emptyProfile, missingFields, sanitizeProfile, type Profile } from "@/domain/profile";
import { decodeProfile, encodeProfile } from "@/domain/profile-codec";
import { createLogger } from "@/lib/log";
import { cn } from "@/lib/utils";
import { runTools, type ToolResultBlock, type ToolUseBlock } from "./chat-tools";
import { ProfileCard } from "./ProfileCard";
import { readEvents } from "./sse";
import { TermButton, useIsland, type IslandProps } from "./shared";

const log = createLogger("chat");
const MAX_AUTO_TURNS = 8;

type ApiMessage = { role: "user" | "assistant"; content: string | Record<string, unknown>[] };

interface Pending {
  toolUseId: string;
  input: AskQuestionInput;
  /** results of the other tools in the same assistant turn */
  results: ToolResultBlock[];
}

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: { sitekey: string; callback: (t: string) => void; "error-callback"?: () => void; appearance?: string }) => string;
      reset: (id?: string) => void;
    };
  }
}

function useTurnstile(siteKey: string | undefined) {
  const ref = useRef<HTMLDivElement>(null);
  const [token, setToken] = useState<string>();
  const widget = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!siteKey || !ref.current) return;
    const el = ref.current;
    const render = () => {
      if (window.turnstile && !widget.current) widget.current = window.turnstile.render(el, { sitekey: siteKey, callback: setToken, appearance: "interaction-only" });
    };
    if (window.turnstile) {
      render();
      return;
    }
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = render;
    document.head.appendChild(s);
  }, [siteKey]);
  const consume = () => {
    const t = token;
    setToken(undefined);
    if (widget.current) window.turnstile?.reset(widget.current);
    return t;
  };
  return { ref, token, consume };
}

function textOf(m: ApiMessage): string {
  if (typeof m.content === "string") return m.content;
  return m.content
    .filter((b) => b.type === "text")
    .map((b) => String(b.text ?? ""))
    .join("");
}

export default function Chat(props: IslandProps & { turnstileSiteKey?: string }) {
  const ctx = useIsland(props);
  const { t, href, cat } = ctx;
  const [messages, setMessages] = useState<ApiMessage[]>([]);
  const [profile, setProfile] = useState<Profile>(emptyProfile());
  const [profileDirty, setProfileDirty] = useState(false);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ChatErrorCode>();
  const [pending, setPending] = useState<Pending>();
  const [rec, setRec] = useState<Recommendation>();
  const session = useRef<string | undefined>(undefined);
  const abort = useRef<AbortController | undefined>(undefined);
  const bottom = useRef<HTMLDivElement>(null);
  const turnstile = useTurnstile(props.turnstileSiteKey);
  const needsVerification = !!props.turnstileSiteKey && !session.current && !turnstile.token;

  useEffect(() => {
    const r = window.location.hash ? decodeProfile(window.location.hash) : undefined;
    if (r?.ok) {
      setProfile(r.profile);
      setProfileDirty(true);
    }
  }, []);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, streaming, pending]);

  const live = useMemo(() => (missingFields(profile).length === 0 ? recommend(profile, cat) : undefined), [profile, cat]);

  /** One model turn; returns the assistant content blocks, or undefined on error. */
  const callModel = useCallback(
    async (history: ApiMessage[]): Promise<{ content: Record<string, unknown>[]; stop: string | null } | undefined> => {
      abort.current = new AbortController();
      setStreaming("");
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abort.current.signal,
        body: JSON.stringify({
          messages: history,
          locale: props.locale,
          sessionToken: session.current,
          turnstileToken: session.current ? undefined : turnstile.consume(),
        }),
      });
      if (!res.ok || !res.body) {
        const body = (await res.json().catch(() => ({}))) as { code?: ChatErrorCode };
        log.warn("chat request failed", { status: res.status, code: body.code });
        setError(body.code ?? "upstream");
        return undefined;
      }
      let result: { content: Record<string, unknown>[]; stop: string | null } | undefined;
      for await (const e of readEvents(res.body) as AsyncGenerator<ChatEvent>) {
        if (e.type === "session") session.current = e.token;
        else if (e.type === "text") setStreaming((s) => s + e.text);
        else if (e.type === "message") result = { content: e.content as Record<string, unknown>[], stop: e.stop_reason };
        else if (e.type === "error") {
          log.warn("chat stream error", { code: e.code });
          setError(e.code);
        }
      }
      setStreaming("");
      return result;
    },
    [props.locale, turnstile],
  );

  /** Runs model turns and executes tools until the model stops or asks the user. */
  const drive = useCallback(
    async (history: ApiMessage[], startProfile: Profile) => {
      setBusy(true);
      setError(undefined);
      let msgs = history;
      let prof = startProfile;
      try {
        for (let turn = 0; turn < MAX_AUTO_TURNS; turn++) {
          const out = await callModel(msgs);
          if (!out) return;
          msgs = [...msgs, { role: "assistant", content: out.content }];
          setMessages(msgs);
          const tools = out.content.filter((b) => b.type === "tool_use") as unknown as ToolUseBlock[];
          if (!tools.length || out.stop !== "tool_use") return;
          const run = runTools(tools, prof, cat);
          prof = run.profile;
          setProfile(prof);
          if (run.recommendation) setRec(run.recommendation);
          if (run.question) {
            setPending({ toolUseId: run.question.toolUseId, input: run.question.input, results: run.results });
            return;
          }
          msgs = [...msgs, { role: "user", content: run.results as unknown as Record<string, unknown>[] }];
          setMessages(msgs);
        }
        log.warn("auto turn limit reached");
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          log.error("chat failed", { err });
          setError("upstream");
        }
      } finally {
        setBusy(false);
        setStreaming("");
      }
    },
    [callModel, cat],
  );

  const profileNote = () =>
    profileDirty ? [{ type: "text", text: `[Project profile edited by the user: ${JSON.stringify(profile)}]` }] : [];

  const send = (text: string) => {
    const body = text.trim();
    if (!body || busy) return;
    setInput("");
    let next: ApiMessage[];
    if (pending) {
      // A typed answer to a pending question becomes its tool_result.
      next = [
        ...messages,
        { role: "user", content: [...pending.results, { type: "tool_result", tool_use_id: pending.toolUseId, content: body }, ...profileNote()] as unknown as Record<string, unknown>[] },
      ];
      setPending(undefined);
    } else {
      next = [...messages, { role: "user", content: [...profileNote(), { type: "text", text: body }] }];
    }
    setProfileDirty(false);
    setMessages(next);
    void drive(next, profile);
  };

  const answer = (value: string, label: string) => {
    if (!pending || busy) return;
    const field = pending.input.field;
    const patched =
      field === "avoid" || field === "dependencies"
        ? sanitizeProfile({ ...profile, [field]: [...(profile[field] as string[]), value] })
        : sanitizeProfile({ ...profile, [field]: value });
    setProfile(patched);
    const next: ApiMessage[] = [
      ...messages,
      {
        role: "user",
        content: [
          ...pending.results,
          { type: "tool_result", tool_use_id: pending.toolUseId, content: JSON.stringify({ field, value, label }) },
        ] as unknown as Record<string, unknown>[],
      },
    ];
    setPending(undefined);
    setMessages(next);
    void drive(next, patched);
  };

  const visible = messages
    .map((m, i) => ({ i, role: m.role, text: textOf(m) }))
    .filter((m) => m.text.trim() && !m.text.startsWith("[Project profile edited"));
  const reportHref = `${href("/r")}#${encodeProfile(profile)}`;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <section className="flex min-h-[28rem] flex-col border border-border" aria-label={t("chat.title")}>
        <div className="flex-1 space-y-4 overflow-y-auto p-4" aria-live="polite">
          {visible.length === 0 && !streaming && (
            <div className="space-y-3">
              <p className="text-muted-foreground">{t("chat.examples")}:</p>
              <ul className="space-y-2">
                {["chat.example.1", "chat.example.2", "chat.example.3"].map((k) => (
                  <li key={k}>
                    <button type="button" className="text-start underline" onClick={() => send(t(k))} disabled={busy || needsVerification}>
                      &gt; {t(k)}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {visible.map((m) => (
            <div key={m.i} className={cn("max-w-[90%] whitespace-pre-wrap", m.role === "user" ? "ms-auto border border-border bg-muted p-2" : "")}>
              {m.role === "assistant" && <span className="text-muted-foreground">$ </span>}
              {m.text}
            </div>
          ))}
          {streaming && (
            <div className="max-w-[90%] whitespace-pre-wrap">
              <span className="text-muted-foreground">$ </span>
              {streaming}
              <span className="cursor" aria-hidden="true" />
            </div>
          )}
          {busy && !streaming && <p className="text-muted-foreground">{t("common.loading")}</p>}
          {pending && (
            <div className="space-y-2 border border-primary p-3">
              <p className="text-primary">? {pending.input.question}</p>
              <div className="flex flex-wrap gap-2">
                {pending.input.options.map((o) => (
                  <TermButton key={o.value} onClick={() => answer(o.value, o.label)} disabled={busy}>
                    {o.label}
                  </TermButton>
                ))}
              </div>
            </div>
          )}
          {error && (
            <p role="alert" className="border border-verdict-deny p-2 text-verdict-deny">
              {error === "rate_limited" ? t("chat.limit") : error === "verification" ? t("chat.verify") : t("chat.error")}{" "}
              <a href={href("/wizard")}>{t("nav.wizard")} →</a>
            </p>
          )}
          {rec && !busy && (
            <p>
              <a href={reportHref} className="inline-block bg-primary px-2 text-primary-foreground no-underline">
                {t("chat.report")} →
              </a>
            </p>
          )}
          <div ref={bottom} />
        </div>
        <form
          className="flex gap-2 border-t border-border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <label className="sr-only" htmlFor="chat-input">
            {t("chat.placeholder")}
          </label>
          <textarea
            id="chat-input"
            rows={2}
            value={input}
            maxLength={4000}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder={t("chat.placeholder")}
            className="flex-1 resize-none border border-border bg-background px-2 py-1"
            disabled={needsVerification}
          />
          {busy ? (
            <TermButton onClick={() => abort.current?.abort()}>{t("chat.stop")}</TermButton>
          ) : (
            <TermButton type="submit" disabled={!input.trim() || needsVerification} className="border-primary bg-primary text-primary-foreground">
              {t("chat.send")}
            </TermButton>
          )}
        </form>
        <div ref={turnstile.ref} className="px-3 pb-2" />
        {needsVerification && <p className="px-3 pb-3 text-sm text-muted-foreground">{t("chat.verify")}</p>}
      </section>

      <aside className="space-y-4">
        <section className="border border-border p-4">
          <h2 className="mb-1 text-xl">{t("chat.profile")}</h2>
          <p className="mb-3 text-sm text-muted-foreground">{t("chat.profile.hint")}</p>
          <ProfileCard
            profile={profile}
            t={t}
            highlight={missingFields(profile)}
            onChange={(patch) => {
              setProfile((p) => sanitizeProfile({ ...p, ...patch }));
              setProfileDirty(true);
            }}
          />
        </section>
        <section className="border border-border p-4">
          <h2 className="mb-2 text-xl">{t("chat.candidates")}</h2>
          {live ? (
            <ol className="space-y-1">
              {live.top.map((r, i) => (
                <li key={r.license} className="flex justify-between gap-2">
                  <a href={href(`/licenses/${r.license}`)}>
                    #{i + 1} {ctx.licenseName(r.license)}
                  </a>
                  <span className="text-muted-foreground tabular-nums">{r.score}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">{missingFields(profile).map((f) => t(`q.${f}`)).join(" · ")}</p>
          )}
          {live && (
            <p className="mt-3">
              <a href={reportHref}>{t("chat.report")} →</a>
            </p>
          )}
        </section>
        <p className="text-sm text-muted-foreground">⚠ {t("chat.disclaimer")}</p>
      </aside>
    </div>
  );
}
