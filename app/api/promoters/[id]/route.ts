import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const { getPromoterById } = await import("@/lib/db/queries");
    const promoter = await getPromoterById(id);
    if (!promoter) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(promoter);
  } catch (err) {
    console.error("[api/promoters/[id]] Error:", err);
    return NextResponse.json({ error: "Failed to fetch promoter" }, { status: 500 });
  }
}
