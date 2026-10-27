import { getJobs, postAdminRetry } from "@/server/handlers";
import { getDeps } from "@/server/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return getJobs(request, getDeps());
}

export function POST(request: Request) {
  return postAdminRetry(request, getDeps());
}
