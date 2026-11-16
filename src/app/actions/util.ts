import "server-only";
import { redirect } from "next/navigation";

export const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
export const int = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? "").replace(/[^0-9]/g, "");
  return v ? parseInt(v, 10) : null;
};

/** Append ?key=msg to a path, keeping any #hash at the end. */
const withParam = (path: string, key: string, msg: string) => {
  const [base, hash] = path.split("#");
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}${key}=${encodeURIComponent(msg)}${hash ? "#" + hash : ""}`;
};

export function fail(path: string, msg: string): never {
  redirect(withParam(path, "error", msg));
}

export function ok(path: string, msg: string): never {
  redirect(withParam(path, "ok", msg));
}

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");

/** Next.js uses thrown errors for redirects; let those through. */
export const isRedirect = (e: unknown) =>
  typeof e === "object" && e !== null && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_REDIRECT");
