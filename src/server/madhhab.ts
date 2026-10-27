export const MADHHABS = ["hanafi", "maliki", "shafii", "hanbali"] as const;

export type Madhhab = (typeof MADHHABS)[number];

export const MADHHAB_LABELS: Record<Madhhab, { english: string; arabic: string; description: string }> = {
  hanafi: {
    english: "Hanafi",
    arabic: "الحنفي",
    description: "The school associated with Abu Hanifa and the later Hanafi legal tradition.",
  },
  maliki: {
    english: "Maliki",
    arabic: "المالكي",
    description: "The school associated with Malik ibn Anas and the later Maliki legal tradition.",
  },
  shafii: {
    english: "Shafi'i",
    arabic: "الشافعي",
    description: "The school associated with Muhammad ibn Idris al-Shafi'i and the later Shafi'i legal tradition.",
  },
  hanbali: {
    english: "Hanbali",
    arabic: "الحنبلي",
    description: "The school associated with Ahmad ibn Hanbal and the later Hanbali legal tradition.",
  },
};

export function parseMadhhab(value: unknown): Madhhab {
  if (typeof value === "string" && (MADHHABS as readonly string[]).includes(value)) {
    return value as Madhhab;
  }
  throw new Error("INVALID_MADHHAB");
}
