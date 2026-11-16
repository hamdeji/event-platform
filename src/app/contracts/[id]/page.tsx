import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { fmtDateTime } from "@/lib/format";
import { PrintButton } from "./PrintButton";

export const metadata = { title: "Contract" };

export default async function ContractPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const b = await db.query.bookings.findFirst({ where: eq(schema.bookings.id, id), with: { contract: true, vendor: true, client: true } });
  if (!b?.contract || (b.clientId !== user.id && b.vendor.userId !== user.id && user.role !== "ADMIN")) redirect("/dashboard");
  const c = b.contract;
  return (
    <article className="mx-auto max-w-3xl rounded-xl bg-white p-10 shadow-sm print:shadow-none">
      <div className="no-print mb-6 flex justify-end"><PrintButton /></div>
      <pre className="whitespace-pre-wrap font-serif text-sm leading-relaxed">{c.body}</pre>
      <div className="mt-10 grid grid-cols-2 gap-8 text-sm">
        <div className="border-t border-stone-400 pt-2">
          <div className="font-semibold">Client: {b.client.name}</div>
          <div>{c.clientSignedAt ? `Signed electronically ${fmtDateTime(c.clientSignedAt)} (IP ${c.clientSignIp})` : "Not yet signed"}</div>
        </div>
        <div className="border-t border-stone-400 pt-2">
          <div className="font-semibold">Vendor: {b.vendor.businessName}</div>
          <div>{c.vendorSignedAt ? `Signed electronically ${fmtDateTime(c.vendorSignedAt)} (IP ${c.vendorSignIp})` : "Not yet signed"}</div>
        </div>
      </div>
      <div className="mt-6 text-[10px] text-stone-400">Document hash (SHA-256): {c.bodyHash} · Version {c.version}</div>
    </article>
  );
}
