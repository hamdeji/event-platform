import { weddingPack } from "./wedding";
import type { EventPack } from "./types";

export const PACKS: Record<string, EventPack> = { wedding: weddingPack };

export const getPack = (key: string) => PACKS[key] ?? weddingPack;

export const categoryName = (key: string, pack = "wedding") =>
  getPack(pack).categories.find((c) => c.key === key)?.name ?? key;

export const ALL_CATEGORIES = Object.values(PACKS).flatMap((p) => p.categories);
