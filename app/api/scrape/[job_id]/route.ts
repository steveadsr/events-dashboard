import { NextResponse } from "next/server";
import { getScrapeRun } from "@/lib/db/queries";

export async function GET(_req: Request, { params }: { params: Promise<{ job_id: string }> }) {
  const { job_id } = await params;

  const run = await getScrapeRun(job_id);
  if (!run) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  return NextResponse.json({
    job_id: run.jobId,
    status: run.status,
    events_found: run.eventsFound,
    error: run.errors && (run.errors as object[]).length > 0 ? run.errors : null,
    started_at: run.startedAt,
    completed_at: run.completedAt,
  });
}
