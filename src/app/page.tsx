"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { OrderCard, money } from "@/components/OrderCard";
import type { ChatCard, Order, StateSnapshot } from "@/lib/types";

interface ChatMsg {
  id: string;
  role: "user" | "agent";
  text: string;
  cards?: ChatCard[];
}

const SUGGESTIONS = [
  "Buy wireless headphones for $45",
  "Order a mechanical keyboard for $120",
  "Buy a $25 book from Amazon",
];

const WELCOME: ChatMsg = {
  id: "welcome",
  role: "agent",
  text: "Hi, I'm Concierge — your AI shopping agent. Tell me what to buy and I'll pay with PayPal. Small purchases within your daily limit go through instantly; bigger ones wait for your one-tap approval. Everything I do lands in the audit log.",
};

let msgSeq = 0;
const nextMsgId = () => `msg-${Date.now()}-${msgSeq++}`;

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMsg[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [busyOrder, setBusyOrder] = useState<string | null>(null);
  const [state, setState] = useState<StateSnapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  const refreshState = useCallback(async () => {
    try {
      const res = await fetch("/api/state");
      if (!res.ok) throw new Error("state fetch failed");
      setState((await res.json()) as StateSnapshot);
    } catch {
      setLoadError("Couldn't load the concierge state. Is the dev server running?");
    }
  }, []);

  useEffect(() => {
    void refreshState();
  }, [refreshState]);

  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, sending]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || sending) return;
      setInput("");
      setSending(true);
      setMessages((m) => [...m, { id: nextMsgId(), role: "user", text: trimmed }]);
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: trimmed }),
        });
        const data = (await res.json()) as { reply?: string; cards?: ChatCard[]; state?: StateSnapshot; error?: string };
        if (!res.ok) throw new Error(data.error ?? "chat failed");
        setMessages((m) => [
          ...m,
          { id: nextMsgId(), role: "agent", text: data.reply ?? "", cards: data.cards ?? [] },
        ]);
        if (data.state) setState(data.state);
      } catch (err) {
        setMessages((m) => [
          ...m,
          {
            id: nextMsgId(),
            role: "agent",
            text: `Something went wrong: ${err instanceof Error ? err.message : "unknown error"}. Please try again.`,
          },
        ]);
      } finally {
        setSending(false);
      }
    },
    [sending],
  );

  const actOnOrder = useCallback(async (orderId: string, action: "approve" | "deny") => {
    setBusyOrder(orderId);
    try {
      const res = await fetch(`/api/orders/${orderId}/${action}`, { method: "POST" });
      const data = (await res.json()) as { message?: string; state?: StateSnapshot };
      setMessages((m) => [
        ...m,
        {
          id: nextMsgId(),
          role: "agent",
          text: data.message ?? (action === "approve" ? "Approved." : "Denied."),
        },
      ]);
      if (data.state) setState(data.state);
    } finally {
      setBusyOrder(null);
    }
  }, []);

  const spent = state?.spentTodayUSD ?? 0;
  const limit = state?.settings.dailyLimitUSD ?? 50;
  const remaining = Math.max(0, limit - spent);
  const pendingCount = state?.pendingApprovals.length ?? 0;

  return (
    <div className="flex flex-1 flex-col py-5">
      {/* Status bar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {state?.paypalMode === "mock" ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-gold-soft px-3 py-1 text-xs font-semibold text-[#7a5b00] ring-1 ring-[#e8c96a]">
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            Demo mode — mock PayPal
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-mint-soft px-3 py-1 text-xs font-semibold text-mint ring-1 ring-[#bfe3d4]">
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            Live PayPal sandbox
          </span>
        )}
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-semibold text-ink-soft ring-1 ring-line">
          Agent: {state?.agentMode === "claude" ? "Claude (tool-calling)" : "Rule-based parser"}
        </span>
        {pendingCount > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-gold px-3 py-1 text-xs font-bold text-ink ring-1 ring-[#e8c96a]">
            {pendingCount} awaiting approval
          </span>
        )}
        <span className="ml-auto text-sm font-medium text-ink-soft">
          Spent today <span className="font-bold text-ink">{money(spent)}</span>
          {" / "}
          {money(limit)} · {money(remaining)} left
        </span>
      </div>

      {loadError && (
        <p className="mb-4 rounded-xl bg-rose-soft px-4 py-3 text-sm font-medium text-rose">{loadError}</p>
      )}

      {/* Thread */}
      <div
        ref={threadRef}
        className="scroll-slim min-h-[420px] flex-1 space-y-5 overflow-y-auto rounded-2xl border border-line bg-white/60 p-4 sm:p-6"
      >
        {messages.map((m) => (
          <div key={m.id} className="animate-fade-up">
            {m.role === "user" ? (
              <div className="flex justify-end">
                <div className="max-w-[80%] rounded-2xl rounded-br-md bg-navy px-4 py-3 text-[15px] leading-relaxed text-white shadow-sm">
                  {m.text}
                </div>
              </div>
            ) : (
              <div className="flex gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy text-sm font-bold text-white">
                  C
                </span>
                <div className="min-w-0 max-w-[85%] space-y-3">
                  <div className="whitespace-pre-line rounded-2xl rounded-tl-md border border-line bg-white px-4 py-3 text-[15px] leading-relaxed text-ink shadow-[0_1px_2px_rgba(28,36,51,0.06)]">
                    {m.text}
                  </div>
                  {m.cards?.map((card, i) => {
                    const order: Order | undefined = state?.orders.find((o) => o.id === card.orderId);
                    if (!order) return null;
                    return (
                      <OrderCard
                        key={`${card.orderId}-${i}`}
                        order={order}
                        busy={busyOrder === order.id}
                        onApprove={(id) => void actOnOrder(id, "approve")}
                        onDeny={(id) => void actOnOrder(id, "deny")}
                      />
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ))}
        {sending && (
          <div className="flex gap-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy text-sm font-bold text-white">
              C
            </span>
            <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-md border border-line bg-white px-4 py-3.5 shadow-[0_1px_2px_rgba(28,36,51,0.06)]">
              <span className="typing-dot h-2 w-2 rounded-full bg-ink-faint" />
              <span className="typing-dot h-2 w-2 rounded-full bg-ink-faint" />
              <span className="typing-dot h-2 w-2 rounded-full bg-ink-faint" />
            </div>
          </div>
        )}
      </div>

      {/* Suggestions */}
      <div className="mt-4 flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => void send(s)}
            disabled={sending}
            className="rounded-full border border-line bg-white px-3.5 py-2 text-[13px] font-medium text-ink-soft transition hover:border-navy hover:text-navy disabled:opacity-50"
          >
            {s}
          </button>
        ))}
      </div>

      {/* Composer */}
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask Concierge to buy something… e.g. “Buy wireless headphones for $45”"
          className="min-w-0 flex-1 rounded-2xl border border-line bg-white px-4 py-3.5 text-[15px] text-ink shadow-sm outline-none placeholder:text-ink-faint focus:border-paypal focus:ring-2 focus:ring-paypal/20"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="shrink-0 rounded-2xl bg-navy px-5 py-3.5 text-[15px] font-semibold text-white shadow-sm transition hover:bg-paypal-deep disabled:opacity-40"
        >
          Send
        </button>
      </form>
      <p className="mt-3 text-center text-xs text-ink-faint">
        Demo runs on a mock PayPal client until sandbox credentials are configured — no real money
        moves. See the Dashboard for transactions, the audit log, and guardrail settings.
      </p>
    </div>
  );
}
