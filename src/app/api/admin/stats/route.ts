import { getAdminStats } from "@/server/handlers";
import { getDeps } from "@/server/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return getAdminStats(request, getDeps());
}
