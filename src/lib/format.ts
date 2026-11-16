export const naira = (n: number | null | undefined) =>
  n == null ? "—" : "₦" + Math.round(n).toLocaleString("en-NG");

export const shortNaira = (n: number) => {
  if (n >= 1_000_000) return "₦" + (n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1) + "m";
  if (n >= 1_000) return "₦" + Math.round(n / 1_000) + "k";
  return "₦" + n;
};

export const fmtDate = (d: Date | string) =>
  new Date(d).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });

export const fmtDateTime = (d: Date | string) =>
  new Date(d).toLocaleString("en-NG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60);

export const statusLabel = (s: string) =>
  s.toLowerCase().replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
