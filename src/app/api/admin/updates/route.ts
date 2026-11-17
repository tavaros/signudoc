import { NextResponse } from "next/server";

import { requireAdminSession } from "@/lib/auth/admin";
import { logRouteError } from "@/lib/security/logging";
import {
  applyRateLimit,
  buildRateLimitKey,
} from "@/lib/security/route-controls";
import { getClientIpAddress, getRequestPathname } from "@/lib/security/request";
import { checkForUpdate, getUpdateStatus } from "@/lib/software-update";

// "Check for updates" in the SignuDoc section of Settings: whether a newer
// release than the running version has been published. The page itself
// shows the running version without asking GitHub.

/** Asks GitHub for the latest release (answer cached on the server). */
export async function POST(request: Request) {
  const sessionResult = await requireAdminSession(request);

  if (sessionResult instanceof Response) {
    return sessionResult;
  }

  const userId = sessionResult.user.id;
  const rateLimitResponse = await applyRateLimit({
    category: "update_check",
    key: buildRateLimitKey(["update-check", userId]),
    limit: 30,
    request,
    userId,
    windowMs: 10 * 60 * 1000,
  });

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    return NextResponse.json(getUpdateStatus(await checkForUpdate()));
  } catch (error) {
    logRouteError(error, {
      category: "update_check_failure",
      ipAddress: getClientIpAddress(request.headers),
      message: "Unexpected failure while checking for updates.",
      path: getRequestPathname(request),
      userId,
    });

    return NextResponse.json(
      { error: "Updates could not be checked. Please try again." },
      { status: 500 },
    );
  }
}
