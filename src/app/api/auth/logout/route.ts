import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/auth/csrf";
import { userFromRequest } from "@/lib/auth/request";
import { writeAudit, clientIp } from "@/lib/services/audit-service";
import { errorResponse } from "@/lib/api/helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const user = userFromRequest(request);
    if (user) {
      writeAudit(getDb(), {
        userId: user.id,
        action: "LOGOUT",
        objectType: "USER",
        objectId: user.id,
        ip: clientIp(request),
      });
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
