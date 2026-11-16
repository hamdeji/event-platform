"use server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { resolveDispute, runAutoRelease } from "@/lib/escrow";
import { errMsg, fail, int, isRedirect, ok, str } from "./util";

export async function setVendorStatus(vendorId: string, action: "approve" | "reject" | "pro" | "demote") {
  await requireUser(["ADMIN"]);
  const set =
    action === "approve"
      ? { kycStatus: "APPROVED" as const, tier: "VERIFIED" as const, idVerified: true }
      : action === "reject"
        ? { kycStatus: "REJECTED" as const, tier: "LISTED" as const }
        : action === "pro"
          ? { tier: "PRO" as const }
          : { tier: "VERIFIED" as const };
  await db.update(schema.vendors).set(set).where(eq(schema.vendors.id, vendorId));
  revalidatePath("/admin");
}

export async function resolve(disputeId: string, fd: FormData) {
  const admin = await requireUser(["ADMIN"]);
  const pct = Math.min(100, Math.max(0, int(fd, "vendorPercent") ?? 0));
  try {
    await resolveDispute(disputeId, admin.id, pct, str(fd, "resolution") || "Mediator decision");
  } catch (e) {
    if (isRedirect(e)) throw e;
    fail("/admin", errMsg(e));
  }
  ok("/admin", "Dispute resolved and funds distributed.");
}

export async function autoRelease() {
  const admin = await requireUser(["ADMIN"]);
  const n = await runAutoRelease(admin.id);
  ok("/admin", `${n} milestone(s) auto-released.`);
}
