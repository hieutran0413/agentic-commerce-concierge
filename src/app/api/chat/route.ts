import { NextResponse } from "next/server";
import { runAgent } from "@/lib/agent";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { message?: unknown };
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }
    const result = await runAgent(message);
    return NextResponse.json(result);
  } catch (err) {
    console.error("chat route error", err);
    return NextResponse.json({ error: "Agent failed to respond" }, { status: 500 });
  }
}
