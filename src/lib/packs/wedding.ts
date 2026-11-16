/**
 * Wedding event pack.
 *
 * The platform core is event-agnostic. Everything wedding-specific lives in a pack:
 * ceremonies, cultures, budget categories (with default weights and reference prices),
 * and contract clauses. To add burials, birthdays or conferences later, add a new pack
 * file with the same shape and register it in ./index.ts.
 *
 * Reference prices are 2026 planning estimates for Lagos/Abuja mid-range events and are
 * only used to ground the AI planner and the offline template fallback. Real transaction
 * data on the platform should replace them over time.
 */
import type { EventPack } from "./types";

export const weddingPack: EventPack = {
  key: "wedding",
  name: "Wedding",
  ceremonies: [
    { key: "introduction", name: "Introduction" },
    { key: "traditional", name: "Traditional wedding" },
    { key: "court", name: "Court / registry" },
    { key: "church", name: "Church ceremony" },
    { key: "nikkah", name: "Nikkah / mosque" },
    { key: "reception", name: "White wedding reception" },
    { key: "afterparty", name: "After-party" },
  ],
  cultures: ["Yoruba", "Igbo", "Hausa", "Edo", "Efik / Ibibio", "Urhobo", "Mixed", "Other"],
  styles: ["Classic", "Glam / owambe", "Intimate", "Rustic", "Modern minimal", "Royal / regal", "Outdoor garden"],
  categories: [
    { key: "VENUE", name: "Venue / hall", weight: 16, refRange: "₦1.5m–₦5m per day for 300–500 guests (Lagos mainland to island)" },
    { key: "CATERING", name: "Catering", weight: 20, refRange: "₦5,000–₦8,000 per guest elaborate; ₦3,000–₦5,000 standard" },
    { key: "DRINKS", name: "Drinks & small chops", weight: 8, refRange: "₦1,500–₦4,000 per guest" },
    { key: "DECOR", name: "Decor & lighting", weight: 11, refRange: "₦800k–₦5m+" },
    { key: "PHOTO_VIDEO", name: "Photography & video", weight: 8, refRange: "₦500k–₦3m" },
    { key: "MUSIC_MC", name: "DJ, live band & MC", weight: 7, refRange: "₦300k–₦2.5m" },
    { key: "ATTIRE", name: "Couple attire", weight: 8, refRange: "₦500k–₦4m" },
    { key: "MAKEUP", name: "Makeup & gele", weight: 3, refRange: "₦150k–₦600k for bride; gele ₦10k–₦35k each" },
    { key: "CAKE", name: "Cake & desserts", weight: 3, refRange: "₦200k–₦1.2m" },
    { key: "SOUVENIRS", name: "Souvenirs", weight: 3, refRange: "₦1,000–₦5,000 per guest" },
    { key: "RENTALS", name: "Chairs, tables, canopies, generators", weight: 4, refRange: "₦300k–₦1.5m" },
    { key: "SECURITY", name: "Security & ushers", weight: 2, refRange: "₦150k–₦600k" },
    { key: "LOGISTICS", name: "Transport & logistics", weight: 2, refRange: "₦150k–₦800k" },
    { key: "TRAD_ITEMS", name: "Bride price & traditional items list", weight: 3, refRange: "Varies widely by culture and family" },
    { key: "PLANNER", name: "Planner / coordinator", weight: 2, refRange: "₦300k–₦2m" },
  ],
  contractClauses: {
    default: [
      "The Vendor shall deliver the services exactly as itemised in Schedule A.",
      "Substitution of named personnel or materials requires the Client's written consent in the platform chat.",
      "The Vendor shall arrive at the venue no later than the agreed arrival time. Arrival is evidenced by the platform gate scan.",
    ],
    CATERING: [
      "Food shall be served hot and in the quantities stated. Shortfall in plates is refunded pro rata.",
      "The Vendor holds responsibility for food hygiene and shall provide the agreed number of servers in uniform.",
    ],
    PHOTO_VIDEO: [
      "Edited photos shall be delivered within 30 days and the highlight video within 60 days of the event via the platform.",
      "The Vendor may use images for portfolio purposes only with the Client's consent recorded on the platform.",
    ],
    VENUE: [
      "The venue shall be available for setup from the agreed time and the Client shall vacate by the agreed closing time.",
      "Power supply (grid or generator, including diesel) for the agreed hours is included unless stated otherwise.",
    ],
    DECOR: ["Setup shall be completed at least 1 hour before guest arrival. Teardown is the Vendor's responsibility."],
    MUSIC_MC: ["Equipment, backup power and sound engineer are included. Overtime is billed at the rate in Schedule A."],
  },
};
