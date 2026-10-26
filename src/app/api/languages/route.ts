import { listLanguages, listLocales, SPEAKER_RANKING } from "@/data/languages";
import { json } from "@/server/handlers";

export function GET() {
  return json({ ranking: SPEAKER_RANKING, languages: listLanguages(), locales: listLocales() });
}
