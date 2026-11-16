// Central platform configuration. Rename the brand here.
export const BRAND = {
  name: "Eventa",
  tagline: "Plan it. Book it. Pay safely.",
  country: "Nigeria",
  currency: "NGN",
};

const num = (v: string | undefined, d: number) => (v && !isNaN(Number(v)) ? Number(v) : d);

export const ECON = {
  commissionPct: num(process.env.PLATFORM_COMMISSION_PCT, 10),
  proCommissionPct: num(process.env.PRO_COMMISSION_PCT, 8),
  clientFeePct: num(process.env.CLIENT_PROTECTION_FEE_PCT, 2),
  autoReleaseHours: num(process.env.AUTO_RELEASE_HOURS, 72),
  vatPct: 7.5,
};

// Default milestone schedule applied to every accepted quote.
export const MILESTONES = [
  { label: "Commitment deposit", percent: 30, earlyRelease: true },
  { label: "Pre-event payment", percent: 50, earlyRelease: false },
  { label: "Final payment on delivery", percent: 20, earlyRelease: false },
];

export const APP_URL = process.env.APP_URL || "http://localhost:3000";
