import { NextResponse } from "next/server";
import { getLeaderboard } from "@/lib/leaderboard";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const type = searchParams.get("type") || "lp";
  const period = searchParams.get("period") || "all";

  const data = await getLeaderboard(type, period);

  return NextResponse.json(data);
}