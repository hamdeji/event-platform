import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, schema } from "./db";
import type { Role, User } from "@/db/schema";

const COOKIE = "eventa_session";
const secret = () => new TextEncoder().encode(process.env.AUTH_SECRET || "dev-secret");

export type Session = { userId: string; role: Role; name: string };

export const hashPassword = (pw: string) => bcrypt.hash(pw, 10);
export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);

export async function createSession(user: Pick<User, "id" | "role" | "name">) {
  const token = await new SignJWT({ role: user.role, name: user.name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("14d")
    .sign(secret());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && !process.env.APP_URL?.startsWith("http://"),
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return { userId: payload.sub as string, role: payload.role as Role, name: payload.name as string };
  } catch {
    return null;
  }
}

/** Require a signed-in user (optionally with one of the given roles). */
export async function requireUser(roles?: Role[]) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (roles && !roles.includes(s.role)) redirect("/dashboard");
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, s.userId), with: { vendor: true } });
  if (!user) redirect("/login");
  return user;
}

/** Load an event the current user owns (admins can see all). */
export async function requireEvent(eventId: string) {
  const user = await requireUser();
  const event = await db.query.events.findFirst({ where: eq(schema.events.id, eventId) });
  if (!event || (event.ownerId !== user.id && user.role !== "ADMIN")) redirect("/dashboard");
  return { user, event };
}
