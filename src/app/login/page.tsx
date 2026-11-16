import Link from "next/link";
import { login } from "@/app/actions/auth";
import { Flash } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

export const metadata = { title: "Log in" };

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const sp = await searchParams;
  return (
    <div className="mx-auto max-w-sm space-y-4 py-10">
      <h1 className="h1">Welcome back</h1>
      <Flash sp={sp} />
      <form action={login} className="card space-y-4">
        <input type="hidden" name="next" value={sp.next ?? ""} />
        <div>
          <label className="label">Email</label>
          <input className="input" name="email" type="email" required autoComplete="email" />
        </div>
        <div>
          <label className="label">Password</label>
          <input className="input" name="password" type="password" required autoComplete="current-password" />
        </div>
        <SubmitButton className="btn-primary w-full">Log in</SubmitButton>
      </form>
      <p className="muted">
        New here? <Link href="/signup" className="font-semibold text-brand-700">Create an account</Link>
      </p>
      {process.env.NODE_ENV !== "production" && (
        <div className="card text-xs text-stone-500">
          <div className="font-semibold text-stone-700">Demo logins (password: password123)</div>
          client@eventa.ng · vendor@eventa.ng · admin@eventa.ng · gate@eventa.ng
        </div>
      )}
    </div>
  );
}
