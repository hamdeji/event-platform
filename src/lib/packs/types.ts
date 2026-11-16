export type PackCategory = { key: string; name: string; weight: number; refRange: string };

export type EventPack = {
  key: string;
  name: string;
  ceremonies: { key: string; name: string }[];
  cultures: string[];
  styles: string[];
  categories: PackCategory[];
  contractClauses: Record<string, string[]>;
};
