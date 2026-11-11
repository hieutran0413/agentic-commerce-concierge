import { NextResponse } from "next/server";
import { addAudit, getStore, updateStore } from "@/lib/store";
import { getState } from "@/lib/agent";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      dailyLimitUSD?: unknown;
      merchants?: unknown;
    };

    const updates: string[] = [];
    updateStore((s) => {
      if (typeof body.dailyLimitUSD === "number" && Number.isFinite(body.dailyLimitUSD) && body.dailyLimitUSD > 0) {
        s.settings.dailyLimitUSD = Math.round(body.dailyLimitUSD * 100) / 100;
        updates.push(`daily limit → $${s.settings.dailyLimitUSD.toFixed(2)}`);
      }
      if (Array.isArray(body.merchants)) {
        const cleaned = body.merchants
          .filter((m): m is string => typeof m === "string")
          .map((m) => m.trim())
          .filter(Boolean)
          .slice(0, 50);
        s.settings.merchants = [...new Set(cleaned)];
        updates.push(`allowlist → ${s.settings.merchants.join(", ") || "(empty)"}`);
      }
    });

    if (updates.length > 0) {
      addAudit("user", "Settings updated", updates.join("; "), "Changed from the dashboard.");
    }

    return NextResponse.json({ ok: true, state: getState(), settings: getStore().settings });
  } catch (err) {
    console.error("settings route error", err);
    return NextResponse.json({ error: "Invalid settings payload" }, { status: 400 });
  }
}
