import { getAdminSources, postAdminReview, postInstitutionReview } from "@/server/handlers";
import { getDeps } from "@/server/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return getAdminSources(request, getDeps());
}

export function PUT(request: Request) {
  return postAdminReview(request, getDeps());
}

export function POST(request: Request) {
  return postInstitutionReview(request, getDeps());
}
