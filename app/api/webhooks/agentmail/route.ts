import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { emailSignals } from "@/lib/db/schema";

export async function POST(req: NextRequest) {
  // Validate using AgentMail API key
  const authHeader = req.headers.get("authorization");
  const apiKey = process.env.AGENTMAIL_API_KEY;

  if (!apiKey || authHeader !== `Bearer ${apiKey}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const payload = body as {
    inbox_id?: string;
    subject?: string;
    body_text?: string;
    received_at?: string;
    signal_type?: string;
  };

  await db.insert(emailSignals).values({
    agentmailInboxId: payload.inbox_id ?? null,
    subject: payload.subject ?? null,
    bodyText: payload.body_text ?? null,
    receivedAt: payload.received_at ? new Date(payload.received_at) : new Date(),
    signalType: (payload.signal_type as "PRESALE_NOTICE" | "LAUNCH_ANNOUNCEMENT" | "PROMO_PUSH" | "STATUS_CHANGE" | "OTHER") ?? "OTHER",
  });

  return NextResponse.json({ ok: true });
}
