import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const { getEventById } = await import("@/lib/db/queries");
    const event = await getEventById(id);
    if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(event);
  } catch (err) {
    console.error("[api/events/[id]] Error:", err);
    return NextResponse.json({ error: "Failed to fetch event" }, { status: 500 });
  }
}
