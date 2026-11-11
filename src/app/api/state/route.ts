import { NextResponse } from "next/server";
import { getState } from "@/lib/agent";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getState());
}
