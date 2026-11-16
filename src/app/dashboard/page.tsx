import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

export default async function Dashboard() {
  const s = await getSession();
  if (!s) redirect("/login");
  redirect({ CLIENT: "/events", VENDOR: "/vendor", ADMIN: "/admin", GATE: "/gate" }[s.role]);
}
