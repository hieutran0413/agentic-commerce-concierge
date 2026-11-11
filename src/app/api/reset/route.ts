import { NextResponse } from "next/server";
import { resetStore } from "@/lib/store";
import { getState } from "@/lib/agent";

export const dynamic = "force-dynamic";

/** Demo helper: wipe orders/audit and restore default settings. */
export async function POST() {
  resetStore();
  return NextResponse.json({ ok: true, state: getState() });
}
