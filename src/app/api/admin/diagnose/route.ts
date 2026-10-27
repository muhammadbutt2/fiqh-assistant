import { postAdminDiagnose } from "@/server/handlers";
import { getDeps } from "@/server/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return postAdminDiagnose(request, getDeps());
}
