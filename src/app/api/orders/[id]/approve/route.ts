import { NextResponse } from "next/server";
import { approveOrder, getState } from "@/lib/agent";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await approveOrder(id);
  return NextResponse.json({ ...result, state: getState() }, { status: result.ok ? 200 : 400 });
}
