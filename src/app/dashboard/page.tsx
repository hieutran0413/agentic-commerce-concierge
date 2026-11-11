"use client";

import { useCallback, useEffect, useState } from "react";
import { StatusPill, fmtTime, money } from "@/components/OrderCard";
import type { StateSnapshot } from "@/lib/types";

const ACTOR_STYLES: Record<string, string> = {
  agent: "bg-navy text-white",
  policy: "bg-gold text-ink",
  user: "bg-mint text-white",
  system: "bg-ink-faint text-white",
};

export default function DashboardPage() {
  const [state, setState] = useState<StateSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [limitInput, setLimitInput] = useState("50");
  const [newMerchant, setNewMerchant] = useState("");
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [savedNote, setSavedNote] = useState("");

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/state");
      if (!res.ok) throw new Error("state fetch failed");
      const s = (await res.json()) as StateSnapshot;
      setState(s);
      setLimitInput(String(s.settings.dailyLimitUSD));
    } catch {
      setError("Couldn't load the dashboard state. Is the dev server running?");
    }
  }, []);

  // Mount-time data load: the dashboard fetches its initial state once.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  const saveSettings = useCallback(
    async (patch: { dailyLimitUSD?: number; merchants?: string[] }) => {
      setSaving(true);
      setSavedNote("");
      try {
        const res = await fetch("/api/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        const data = (await res.json()) as { state?: StateSnapshot; error?: string };
        if (!res.ok) throw new Error(data.error ?? "save failed");
        if (data.state) {
          setState(data.state);
          setLimitInput(String(data.state.settings.dailyLimitUSD));
        }
        setSavedNote("Saved.");
      } catch (err) {
        setSavedNote(err instanceof Error ? err.message : "Save failed.");
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  const resetDemo = useCallback(async () => {
    if (!window.confirm("Reset the demo? All orders and audit entries will be cleared.")) return;
    setResetting(true);
    try {
      const res = await fetch("/api/reset", { method: "POST" });
      const data = (await res.json()) as { state?: StateSnapshot };
      if (data.state) {
        setState(data.state);
        setLimitInput(String(data.state.settings.dailyLimitUSD));
      }
    } finally {
      setResetting(false);
    }
  }, []);

  if (error && !state) {
    return (
      <div className="py-10">
        <p className="rounded-xl bg-rose-soft px-4 py-3 text-sm font-medium text-rose">{error}</p>
      </div>
    );
  }

  const spent = state?.spentTodayUSD ?? 0;
  const limit = state?.settings.dailyLimitUSD ?? 50;
  const pct = Math.min(100, Math.round((spent / Math.max(limit, 0.01)) * 100));
  const captured = state?.orders.filter((o) => o.status === "CAPTURED").length ?? 0;

  return (
    <div className="space-y-6 py-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">Dashboard</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Transactions, the audit log of every agent decision, and your guardrails.
          </p>
        </div>
        <button
          onClick={() => void resetDemo()}
          disabled={resetting}
          className="rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-rose transition hover:bg-rose-soft disabled:opacity-50"
        >
          {resetting ? "Resetting…" : "Reset demo"}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-2xl border border-line bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-faint">Spent today</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-ink">
            {money(spent)} <span className="text-sm font-medium text-ink-faint">/ {money(limit)}</span>
          </p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/5">
            <div
              className={`h-full rounded-full ${pct >= 100 ? "bg-rose" : "bg-paypal"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-ink-soft">{money(Math.max(0, limit - spent))} left before approval kicks in</p>
        </div>
        <div className="rounded-2xl border border-line bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-faint">Orders</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-ink">{state?.orders.length ?? 0}</p>
          <p className="mt-2 text-xs text-ink-soft">{captured} paid · {state?.pendingApprovals.length ?? 0} awaiting approval</p>
        </div>
        <div className="rounded-2xl border border-line bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-faint">PayPal</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-ink">
            {state?.paypalMode === "mock" ? "Mock" : "Sandbox"}
          </p>
          <p className="mt-2 text-xs text-ink-soft">
            {state?.paypalMode === "mock"
              ? "Demo mode — no real money moves"
              : "Live sandbox credentials configured"}
          </p>
        </div>
        <div className="rounded-2xl border border-line bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-faint">Agent</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-ink">
            {state?.agentMode === "claude" ? "Claude" : "Rule-based"}
          </p>
          <p className="mt-2 text-xs text-ink-soft">
            {state?.agentMode === "claude" ? "Tool-calling via Anthropic API" : "Deterministic intent parser — no key needed"}
          </p>
        </div>
      </div>

      {/* Guardrails */}
      <section className="rounded-2xl border border-line bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold tracking-tight text-ink">Guardrails</h2>
        <p className="mt-0.5 text-sm text-ink-soft">
          Purchases at or under the daily limit auto-pay. Anything above it — or from a merchant not
          on the allowlist — waits for your one-tap approval.
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-faint">
              Daily spending limit (USD)
            </span>
            <input
              type="number"
              min={1}
              step={1}
              value={limitInput}
              onChange={(e) => setLimitInput(e.target.value)}
              className="mt-1 w-36 rounded-xl border border-line bg-white px-3 py-2.5 text-[15px] font-semibold text-ink outline-none focus:border-paypal focus:ring-2 focus:ring-paypal/20"
            />
          </label>
          <button
            onClick={() => void saveSettings({ dailyLimitUSD: parseFloat(limitInput) })}
            disabled={saving}
            className="rounded-xl bg-navy px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-paypal-deep disabled:opacity-50"
          >
            Save limit
          </button>
          {savedNote && <span className="pb-2.5 text-sm font-medium text-mint">{savedNote}</span>}
        </div>
        <div className="mt-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-faint">
            Merchant allowlist
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(state?.settings.merchants ?? []).map((m) => (
              <span
                key={m}
                className="inline-flex items-center gap-1.5 rounded-full bg-paper px-3 py-1.5 text-sm font-medium text-ink ring-1 ring-line"
              >
                {m}
                <button
                  aria-label={`Remove ${m}`}
                  onClick={() =>
                    void saveSettings({
                      merchants: (state?.settings.merchants ?? []).filter((x) => x !== m),
                    })
                  }
                  className="text-ink-faint transition hover:text-rose"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <form
            className="mt-3 flex max-w-sm gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const name = newMerchant.trim();
              if (!name) return;
              void saveSettings({ merchants: [...(state?.settings.merchants ?? []), name] });
              setNewMerchant("");
            }}
          >
            <input
              value={newMerchant}
              onChange={(e) => setNewMerchant(e.target.value)}
              placeholder="Add a merchant…"
              className="min-w-0 flex-1 rounded-xl border border-line bg-white px-3 py-2.5 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-paypal focus:ring-2 focus:ring-paypal/20"
            />
            <button
              type="submit"
              className="shrink-0 rounded-xl border border-line bg-white px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-paper"
            >
              Add
            </button>
          </form>
        </div>
      </section>

      {/* Transactions */}
      <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-lg font-bold tracking-tight text-ink">Transactions</h2>
        </div>
        {(state?.orders.length ?? 0) === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-ink-soft">
            No transactions yet — ask Concierge to buy something in the chat.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs uppercase tracking-wider text-ink-faint">
                  <th className="px-5 py-3 font-semibold">Item</th>
                  <th className="px-5 py-3 font-semibold">Merchant</th>
                  <th className="px-5 py-3 font-semibold">Amount</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold">PayPal order</th>
                  <th className="px-5 py-3 font-semibold">Time</th>
                </tr>
              </thead>
              <tbody>
                {state?.orders.map((o) => (
                  <tr key={o.id} className="border-b border-line last:border-0 hover:bg-paper/60">
                    <td className="px-5 py-3 font-semibold text-ink">{o.item}</td>
                    <td className="px-5 py-3 text-ink-soft">{o.merchant}</td>
                    <td className="px-5 py-3 font-semibold text-ink">{money(o.amount)}</td>
                    <td className="px-5 py-3">
                      <StatusPill status={o.status} />
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-ink-faint">{o.paypalOrderId}</td>
                    <td className="px-5 py-3 text-ink-soft">{fmtTime(o.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Audit log */}
      <section className="rounded-2xl border border-line bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold tracking-tight text-ink">Audit log</h2>
        <p className="mt-0.5 text-sm text-ink-soft">
          Every agent decision, with the reason it was made. Nothing is spent without a record.
        </p>
        <ol className="mt-4 space-y-4">
          {(state?.audit ?? []).map((a) => (
            <li key={a.id} className="flex gap-3">
              <span
                className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold uppercase ${ACTOR_STYLES[a.actor] ?? "bg-ink-faint text-white"}`}
              >
                {a.actor.slice(0, 2)}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">
                  {a.action}
                  <span className="ml-2 text-xs font-normal text-ink-faint">{fmtTime(a.at)}</span>
                </p>
                <p className="text-sm text-ink-soft">{a.detail}</p>
                <p className="mt-0.5 text-xs italic text-ink-faint">Why: {a.reason}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
