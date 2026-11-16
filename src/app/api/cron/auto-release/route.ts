import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { runAutoRelease } from "@/lib/escrow";

/**
 * Releases escrow milestones whose confirmation window has passed.
 * Schedule every 15 minutes (Vercel Cron, GitHub Actions, or system cron) with header
 * "Authorization: Bearer $CRON_SECRET".
 */
export async function GET(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = await db.query.users.findFirst({ where: eq(schema.users.role, "ADMIN") });
  if (!admin) return NextResponse.json({ error: "No admin user" }, { status: 500 });
  const released = await runAutoRelease(admin.id);
  return NextResponse.json({ released });
}
