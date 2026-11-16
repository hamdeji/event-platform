"use server";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { createSession, destroySession, hashPassword, verifyPassword } from "@/lib/auth";
import { slugify } from "@/lib/format";
import { getPack } from "@/lib/packs";
import { fail, int, str } from "./util";

export async function login(fd: FormData) {
  const email = str(fd, "email").toLowerCase();
  const user = await db.query.users.findFirst({ where: eq(schema.users.email, email) });
  if (!user || !(await verifyPassword(str(fd, "password"), user.passwordHash))) fail("/login", "Email or password is incorrect.");
  await createSession(user);
  redirect(str(fd, "next") || "/dashboard");
}

export async function signup(fd: FormData) {
  const role = str(fd, "role") === "VENDOR" ? "VENDOR" : "CLIENT";
  const email = str(fd, "email").toLowerCase();
  const name = str(fd, "name");
  const password = str(fd, "password");
  const back = `/signup?role=${role}`;
  if (!name || !email.includes("@")) fail(back, "Enter your name and a valid email.");
  if (password.length < 8) fail(back, "Password must be at least 8 characters.");
  const exists = await db.query.users.findFirst({ where: eq(schema.users.email, email) });
  if (exists) fail(back, "An account with this email already exists.");

  const [user] = await db
    .insert(schema.users)
    .values({ email, name, phone: str(fd, "phone") || null, passwordHash: await hashPassword(password), role })
    .returning();

  if (role === "VENDOR") {
    const businessName = str(fd, "businessName") || name;
    const category = str(fd, "category");
    if (!getPack("wedding").categories.some((c) => c.key === category)) fail(back, "Choose a service category.");
    let slug = slugify(businessName);
    if (await db.query.vendors.findFirst({ where: eq(schema.vendors.slug, slug) })) slug += "-" + user.id.slice(0, 4).toLowerCase();
    await db.insert(schema.vendors).values({
      userId: user.id,
      businessName,
      slug,
      category,
      city: str(fd, "city") || "Lagos",
      state: str(fd, "state") || str(fd, "city") || "Lagos",
      description: "",
      priceFrom: int(fd, "priceFrom") ?? 0,
      priceUnit: str(fd, "priceUnit") || "per event",
    });
  }
  await createSession(user);
  redirect(role === "VENDOR" ? "/vendor/profile?ok=Welcome! Complete your profile and verification to receive bookings." : "/events/new");
}

export async function logout() {
  await destroySession();
  redirect("/");
}
