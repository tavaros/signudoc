import { NextResponse } from "next/server";

import { requireAdminSession } from "@/lib/auth/admin";
import { listPeople } from "@/lib/people";
import { logRouteError } from "@/lib/security/logging";
import {
  applyRateLimit,
  buildRateLimitKey,
} from "@/lib/security/route-controls";
import {
  getClientIpAddress,
  getRequestPathname,
  getRequestUserAgent,
} from "@/lib/security/request";
import { resetTwoFactor, SignInSecurityError } from "@/lib/sign-in-security";

type PersonRouteContext = {
  params: Promise<{
    id: string;
  }>;
};

const noStore = { "cache-control": "private, no-store" };

// Turns off someone's two-step sign-in, for a person who lost their phone
// and their backup codes, and signs them out everywhere. Administrators
// only. Answers with the list as it now stands, narrowed by `search`.
export async function DELETE(request: Request, context: PersonRouteContext) {
  const sessionResult = await requireAdminSession(request);

  if (sessionResult instanceof Response) {
    return sessionResult;
  }

  const session = sessionResult;
  const { id } = await context.params;
  const rateLimitResponse = await applyRateLimit({
    category: "people_two_factor_reset",
    key: buildRateLimitKey(["people-two-factor", session.user.id]),
    limit: 30,
    request,
    userId: session.user.id,
    windowMs: 10 * 60 * 1000,
  });

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const search = new URL(request.url).searchParams.get("search") ?? "";
  const actor = {
    email: session.user.email,
    ipAddress: getClientIpAddress(request.headers),
    userAgent: getRequestUserAgent(request.headers),
    userId: session.user.id,
  };

  if (id === session.user.id) {
    return NextResponse.json(
      {
        error:
          "Turn off your own two-step sign-in under Settings, Two-step sign-in.",
      },
      { headers: noStore, status: 409 },
    );
  }

  try {
    await resetTwoFactor(actor, id);

    return NextResponse.json(
      { ...(await listPeople({ search })), you: session.user.id },
      { headers: noStore },
    );
  } catch (error) {
    if (error instanceof SignInSecurityError) {
      return NextResponse.json(
        { error: error.message },
        { headers: noStore, status: error.statusCode },
      );
    }

    logRouteError(error, {
      category: "people_two_factor_reset_failure",
      ipAddress: actor.ipAddress,
      message: "Unexpected failure while resetting two-step sign-in.",
      path: getRequestPathname(request),
      userId: session.user.id,
    });

    return NextResponse.json(
      { error: "That change could not be saved." },
      { headers: noStore, status: 500 },
    );
  }
}
