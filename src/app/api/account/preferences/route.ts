import { getPreferences, putPreferences } from "@/server/handlers";
import { getDeps } from "@/server/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return getPreferences(request, getDeps());
}

export function PUT(request: Request) {
  return putPreferences(request, getDeps());
}
