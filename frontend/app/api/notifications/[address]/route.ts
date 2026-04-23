import { NextResponse } from "next/server";
import { getNotifications } from "@/lib/notifications";

export async function GET(
  req: Request,
  { params }: { params: { address: string } }
) {
  const data = await getNotifications(params.address);

  return NextResponse.json(data);
}