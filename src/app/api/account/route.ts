import { deleteAccount, postLogin, postLogout, postRegister } from "@/server/handlers";
import { getDeps } from "@/server/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return postRegister(request, getDeps());
}

export function PUT(request: Request) {
  return postLogin(request, getDeps());
}

export function DELETE(request: Request) {
  return deleteAccount(request, getDeps());
}

export function GET() {
  return postLogout();
}
