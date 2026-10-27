import { listLanguages, listLocales, SOURCE_LANGUAGES, SUPPORTED_LANGUAGES } from "@/data/languages";
import { json } from "@/server/handlers";

export function GET() {
  return json({ supported: SUPPORTED_LANGUAGES, sourceLanguages: SOURCE_LANGUAGES, languages: listLanguages(), locales: listLocales() });
}
