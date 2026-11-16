/* Seed demo data: an admin, a demo client, and fictional vendors in Lagos and Abuja. */
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });
type VendorTier = "LISTED" | "VERIFIED" | "PRO";
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

type V = [name: string, category: string, city: string, priceFrom: number, unit: string, tier: VendorTier, rating: number, styles: string, desc: string];

const vendors: V[] = [
  ["Eko Grand Hall", "VENUE", "Lagos", 2_500_000, "per day", "PRO", 4.8, "Glam / owambe,Royal / regal", "Air-conditioned hall for 600 guests in Ikeja with parking for 150 cars and full generator backup."],
  ["Lekki Pearl Gardens", "VENUE", "Lagos", 3_800_000, "per day", "VERIFIED", 4.6, "Outdoor garden,Modern minimal", "Waterfront garden venue in Lekki Phase 1 for 400 guests with a marquee option."],
  ["Surulere Events Centre", "VENUE", "Lagos", 1_400_000, "per day", "VERIFIED", 4.3, "Classic", "Budget-friendly hall for 350 guests, chairs and tables included."],
  ["Mama Tee Kitchens", "CATERING", "Lagos", 5_500, "per guest", "PRO", 4.9, "Glam / owambe,Classic", "Jollof, fried rice, ofada, pounded yam and amala stations. Uniformed servers included."],
  ["Spice Route Catering", "CATERING", "Lagos", 7_500, "per guest", "VERIFIED", 4.7, "Modern minimal,Royal / regal", "Continental and Nigerian fusion menus with plated service."],
  ["Ajoke Party Foods", "CATERING", "Lagos", 3_800, "per guest", "VERIFIED", 4.2, "Classic,Intimate", "Reliable buffet catering for 100-800 guests."],
  ["Chops & Cocktails NG", "DRINKS", "Lagos", 2_200, "per guest", "PRO", 4.8, "Glam / owambe,Modern minimal", "Small chops, mocktails and a cocktail bar with trained bartenders."],
  ["Bubbles Drinks Co.", "DRINKS", "Lagos", 1_500, "per guest", "VERIFIED", 4.4, "Classic", "Soft drinks, water, malt and palm wine supply with ice and coolers."],
  ["Adire Decor Studio", "DECOR", "Lagos", 1_800_000, "per event", "PRO", 4.9, "Royal / regal,Glam / owambe", "Luxury floral installations, stage backdrops and lighting design."],
  ["Bloom & Drape", "DECOR", "Lagos", 900_000, "per event", "VERIFIED", 4.5, "Classic,Outdoor garden,Intimate", "Elegant decor packages including centrepieces and chair covers."],
  ["Lens of Lagos", "PHOTO_VIDEO", "Lagos", 1_200_000, "per event", "PRO", 4.9, "Modern minimal,Glam / owambe", "Two photographers, two videographers, drone, 400 edited photos and a 5-minute film."],
  ["Click Naija Studios", "PHOTO_VIDEO", "Lagos", 550_000, "per event", "VERIFIED", 4.3, "Classic", "One photographer and one videographer with 250 edited photos."],
  ["DJ Spinall-Style Sounds", "MUSIC_MC", "Lagos", 650_000, "per event", "VERIFIED", 4.6, "Glam / owambe,Modern minimal", "DJ with full sound system, backup generator and lighting rig."],
  ["MC Laff Ventures", "MUSIC_MC", "Lagos", 400_000, "per event", "PRO", 4.8, "Glam / owambe,Classic", "Bilingual English/Yoruba MC who keeps the programme on time."],
  ["Juju Royale Band", "MUSIC_MC", "Lagos", 1_500_000, "per event", "VERIFIED", 4.7, "Royal / regal,Classic", "Live juju and highlife band, 12 members, 4-hour set."],
  ["Gele by Folake", "MAKEUP", "Lagos", 180_000, "per event", "PRO", 4.9, "Glam / owambe,Royal / regal", "Bridal makeup and gele, plus two artists for the bridal train."],
  ["Glow Beauty Lagos", "MAKEUP", "Lagos", 90_000, "per event", "VERIFIED", 4.4, "Modern minimal", "Soft glam bridal makeup with home service."],
  ["Sugar Crumbs Cakes", "CAKE", "Lagos", 350_000, "per event", "VERIFIED", 4.7, "Modern minimal,Royal / regal", "Custom tiered wedding cakes and dessert tables."],
  ["Aso Couture House", "ATTIRE", "Lagos", 850_000, "per event", "PRO", 4.8, "Royal / regal,Glam / owambe", "Bespoke agbada, iro and buba, and white gowns for the couple."],
  ["Party Rentals Ikeja", "RENTALS", "Lagos", 450_000, "per event", "VERIFIED", 4.3, "Classic", "Chiavari chairs, tables, canopies and a 60 kVA generator with diesel."],
  ["ShieldGuard Event Security", "SECURITY", "Lagos", 250_000, "per event", "VERIFIED", 4.5, "Classic", "Uniformed security and trained ushers who use the QR gate app."],
  ["Gifts & Favours NG", "SOUVENIRS", "Lagos", 2_000, "per guest", "VERIFIED", 4.2, "Classic,Modern minimal", "Branded souvenirs: hand fans, mugs, umbrellas and tote bags."],
  ["RideRight Logistics", "LOGISTICS", "Lagos", 300_000, "per event", "LISTED", 0, "Classic", "Guest shuttle buses and couple's car with driver."],
  ["Owambe Planners Co.", "PLANNER", "Lagos", 750_000, "per event", "PRO", 4.9, "Glam / owambe,Royal / regal", "Full planning and day-of coordination team of 6."],
  ["Transcorp-Style Ballroom Abuja", "VENUE", "Abuja", 4_500_000, "per day", "PRO", 4.8, "Royal / regal,Glam / owambe", "Ballroom in Maitama for 700 guests."],
  ["Jabi Lakeside Lawn", "VENUE", "Abuja", 2_200_000, "per day", "VERIFIED", 4.5, "Outdoor garden", "Lakeside lawn for 300 guests with canopies."],
  ["Arewa Delights Catering", "CATERING", "Abuja", 6_000, "per guest", "PRO", 4.8, "Royal / regal,Classic", "Northern and continental menus: tuwo, miyan kuka, suya and jollof."],
  ["Capital Bites", "CATERING", "Abuja", 4_200, "per guest", "VERIFIED", 4.4, "Classic", "Buffet catering for 100-600 guests."],
  ["Zuma Decor", "DECOR", "Abuja", 1_200_000, "per event", "VERIFIED", 4.6, "Royal / regal,Modern minimal", "Stage, floral and lighting packages."],
  ["Aso Rock Shots", "PHOTO_VIDEO", "Abuja", 800_000, "per event", "VERIFIED", 4.6, "Modern minimal", "Photography and cinematic film."],
  ["Sound City Abuja DJs", "MUSIC_MC", "Abuja", 500_000, "per event", "VERIFIED", 4.5, "Glam / owambe", "DJ, MC and sound system."],
  ["Henna & Glam by Aisha", "MAKEUP", "Abuja", 150_000, "per event", "PRO", 4.9, "Royal / regal", "Bridal makeup and henna (lalle) artistry."],
];

async function main() {
  console.log("Seeding…");
  await db.execute(
    sql`TRUNCATE ledger_entries, disputes, reviews, milestones, contracts, messages, bookings, guests, seat_tables, assistant_messages, plan_items, plans, events, vendor_packages, vendors, users CASCADE`,
  );

  const pw = await bcrypt.hash("password123", 10);
  await db.insert(schema.users).values([
    { email: "admin@eventa.ng", name: "Eventa Admin", passwordHash: pw, role: "ADMIN" },
    { email: "client@eventa.ng", name: "Tolu Adebayo", phone: "08030000001", passwordHash: pw, role: "CLIENT" },
    { email: "gate@eventa.ng", name: "Gate Team", passwordHash: pw, role: "GATE" },
  ]);

  for (const [i, [name, category, city, priceFrom, unit, tier, rating, styles, description]] of vendors.entries()) {
    const email = i === 3 ? "vendor@eventa.ng" : `${slug(name)}@vendors.eventa.ng`;
    const isPerGuest = unit.includes("guest");
    const [user] = await db
      .insert(schema.users)
      .values({ email, name: name.split(" ")[0] + " (owner)", phone: `0803${String(1000000 + i).slice(-7)}`, passwordHash: pw, role: "VENDOR" })
      .returning();
    const [vendor] = await db
      .insert(schema.vendors)
      .values({
        userId: user.id,
        businessName: name,
        slug: slug(name),
        category,
        city,
        state: city === "Lagos" ? "Lagos" : "FCT",
        description,
        styles,
        serviceAreas: city === "Lagos" ? "Lagos,Ogun,Ibadan" : "Abuja,Kaduna,Nasarawa",
        priceFrom,
        priceUnit: unit,
        tier,
        kycStatus: tier === "LISTED" ? "PENDING" : "APPROVED",
        idType: "BVN",
        idVerified: tier !== "LISTED",
        cacNumber: tier !== "LISTED" ? `BN${3000000 + i * 137}` : null,
        bankName: "GTBank",
        bankAccountName: name,
        rating: tier === "LISTED" ? 0 : rating,
        reviewCount: tier === "LISTED" ? 0 : Math.round(8 + rating * 6 + i),
        completedBookings: tier === "PRO" ? 14 + i : tier === "VERIFIED" ? 4 + (i % 5) : 0,
      })
      .returning();
    await db.insert(schema.vendorPackages).values([
      { vendorId: vendor.id, name: "Standard", description: "Core package as described.", price: priceFrom, unit },
      {
        vendorId: vendor.id,
        name: "Premium",
        description: "Upgraded package with extra staff, premium materials and overtime cover.",
        price: Math.round(priceFrom * (isPerGuest ? 1.4 : 1.8)),
        unit,
      },
    ]);
  }
  console.log(`Seeded ${vendors.length} vendors.`);
  console.log("Logins (password: password123): client@eventa.ng · vendor@eventa.ng (Mama Tee Kitchens) · admin@eventa.ng · gate@eventa.ng");
}

main().finally(() => pool.end());
