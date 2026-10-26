import { json } from "@/server/handlers";
import { MADHHAB_LABELS, MADHHABS } from "@/server/madhhab";

export function GET() {
  return json({ madhhabs: MADHHABS.map((id) => ({ id, ...MADHHAB_LABELS[id] })) });
}
