import Link from "next/link";
import { getSession } from "@/lib/auth";
import { BRAND } from "@/lib/config";
import { logout } from "@/app/actions/auth";

const linksFor = (role?: string) => {
  switch (role) {
    case "CLIENT":
      return [
        ["/events", "My events"],
        ["/vendors", "Find vendors"],
      ];
    case "VENDOR":
      return [
        ["/vendor", "Bookings"],
        ["/vendor/profile", "My business"],
      ];
    case "ADMIN":
      return [
        ["/admin", "Admin"],
        ["/vendors", "Vendors"],
      ];
    case "GATE":
      return [["/gate", "Gate check-in"]];
    default:
      return [["/vendors", "Find vendors"]];
  }
};

export async function Nav() {
  const s = await getSession();
  return (
    <header className="no-print border-b border-stone-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
        <Link href={s ? "/dashboard" : "/"} className="flex items-center gap-2 text-lg font-extrabold text-brand-700">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-700 text-sm text-gold-400">E</span>
          {BRAND.name}
        </Link>
        <nav className="flex flex-1 gap-4 text-sm font-medium text-stone-600">
          {linksFor(s?.role).map(([href, label]) => (
            <Link key={href} href={href} className="hover:text-brand-700">
              {label}
            </Link>
          ))}
        </nav>
        {s ? (
          <form action={logout} className="flex items-center gap-3 text-sm">
            <span className="hidden text-stone-500 sm:inline">{s.name}</span>
            <button className="btn-outline btn-sm">Log out</button>
          </form>
        ) : (
          <div className="flex gap-2">
            <Link href="/login" className="btn-outline btn-sm">Log in</Link>
            <Link href="/signup" className="btn-primary btn-sm">Get started</Link>
          </div>
        )}
      </div>
    </header>
  );
}
