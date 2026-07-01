import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { setSessionCookie, verifyMagicToken } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) redirect("/login?error=" + encodeURIComponent("Missing sign-in token."));

  const res = await verifyMagicToken(token);
  if ("error" in res) redirect("/login?error=" + encodeURIComponent(res.error));

  await setSessionCookie(res.sessionToken);
  redirect("/");
}
