"use server";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fail, int, ok, str } from "./util";

async function myVendor() {
  const user = await requireUser(["VENDOR"]);
  if (!user.vendor) fail("/dashboard", "No vendor profile.");
  return user.vendor;
}

export async function updateProfile(fd: FormData) {
  const v = await myVendor();
  await db
    .update(schema.vendors)
    .set({
      businessName: str(fd, "businessName") || v.businessName,
      description: str(fd, "description"),
      city: str(fd, "city") || v.city,
      state: str(fd, "state") || v.state,
      styles: str(fd, "styles"),
      serviceAreas: str(fd, "serviceAreas"),
      priceFrom: int(fd, "priceFrom") ?? v.priceFrom,
      priceUnit: str(fd, "priceUnit") || v.priceUnit,
    })
    .where(eq(schema.vendors.id, v.id));
  ok("/vendor/profile", "Profile saved.");
}

export async function submitKyc(fd: FormData) {
  const v = await myVendor();
  const idType = str(fd, "idType");
  const idNumber = str(fd, "idNumber").replace(/\D/g, "");
  const accountNumber = str(fd, "bankAccountNumber").replace(/\D/g, "");
  if (!["BVN", "NIN"].includes(idType) || idNumber.length !== 11) fail("/vendor/profile", "BVN and NIN are 11 digits.");
  if (accountNumber.length !== 10) fail("/vendor/profile", "Enter your 10-digit NUBAN account number.");
  // Production: verify BVN/NIN name match and resolve the bank account via a KYC provider
  // (e.g. Paystack Resolve Account, Dojah, Smile ID) and create a transfer recipient.
  // The raw ID number is never stored.
  await db
    .update(schema.vendors)
    .set({
      idType,
      cacNumber: str(fd, "cacNumber") || null,
      bankName: str(fd, "bankName"),
      bankAccountName: str(fd, "bankAccountName"),
      bankAccountNumber: "******" + accountNumber.slice(-4),
      kycStatus: "PENDING",
    })
    .where(eq(schema.vendors.id, v.id));
  ok("/vendor/profile", "Verification submitted. Our team reviews within 2 working days.");
}

export async function addPackage(fd: FormData) {
  const v = await myVendor();
  const price = int(fd, "price");
  if (!str(fd, "name") || !price) fail("/vendor/profile", "Package needs a name and a price.");
  await db.insert(schema.vendorPackages).values({ vendorId: v.id, name: str(fd, "name"), description: str(fd, "description"), price, unit: str(fd, "unit") || v.priceUnit });
  revalidatePath("/vendor/profile");
}

export async function deletePackage(id: string) {
  const v = await myVendor();
  await db.delete(schema.vendorPackages).where(and(eq(schema.vendorPackages.id, id), eq(schema.vendorPackages.vendorId, v.id)));
  revalidatePath("/vendor/profile");
}
