import { NextResponse } from "next/server";

import { requireAdminSession } from "@/lib/auth/admin";
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
import { getSettings, readStoredSettings } from "@/lib/settings";
import {
  parseSessionLimit,
  SESSION_IDLE_CHOICES,
  SESSION_MAX_HOURS_CHOICES,
} from "@/lib/session-controls";
import {
  setSessionLimits,
  setTwoFactorRequirement,
  SignInSecurityError,
} from "@/lib/sign-in-security";

const noStore = { "cache-control": "private, no-store" };

// Sign-in security settings: whether two-step sign-in is required, or the
// two session limits (both at once). Administrators only.
export async function PUT(request: Request) {
  const sessionResult = await requireAdminSession(request);

  if (sessionResult instanceof Response) {
    return sessionResult;
  }

  const session = sessionResult;
  const rateLimitResponse = await applyRateLimit({
    category: "sign_in_security_change",
    key: buildRateLimitKey(["sign-in-security", session.user.id]),
    limit: 20,
    request,
    userId: session.user.id,
    windowMs: 10 * 60 * 1000,
  });

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const parsed: unknown = await request.json().catch(() => null);
  const body =
    typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as {
          requireTwoFactor?: unknown;
          sessionIdleMinutes?: unknown;
          sessionMaxHours?: unknown;
        })
      : null;
  const changesRequirement = typeof body?.requireTwoFactor === "boolean";
  const changesSessions =
    body !== null &&
    ("sessionIdleMinutes" in body || "sessionMaxHours" in body);
  const sessionIdleMinutes = parseSessionLimit(
    body?.sessionIdleMinutes,
    SESSION_IDLE_CHOICES,
  );
  const sessionMaxHours = parseSessionLimit(
    body?.sessionMaxHours,
    SESSION_MAX_HOURS_CHOICES,
  );

  if (
    !changesRequirement &&
    !(
      changesSessions &&
      sessionIdleMinutes !== undefined &&
      sessionMaxHours !== undefined
    )
  ) {
    return NextResponse.json(
      {
        error:
          "Say whether two-step sign-in should be required, or choose both session limits.",
      },
      { headers: noStore, status: 400 },
    );
  }

  if ((await getSettings()).hosted) {
    return NextResponse.json(
      { error: "This setting is for self-hosted installs." },
      { headers: noStore, status: 400 },
    );
  }

  const actor = {
    email: session.user.email,
    ipAddress: getClientIpAddress(request.headers),
    userAgent: getRequestUserAgent(request.headers),
    userId: session.user.id,
  };

  try {
    if (changesRequirement) {
      await setTwoFactorRequirement(actor, body?.requireTwoFactor === true);
    } else {
      await setSessionLimits(actor, {
        sessionIdleMinutes: sessionIdleMinutes ?? null,
        sessionMaxHours: sessionMaxHours ?? null,
      });
    }

    const stored = await readStoredSettings();

    return NextResponse.json(
      {
        requireTwoFactor: stored?.requireTwoFactor ?? false,
        sessionIdleMinutes: stored?.sessionIdleMinutes ?? null,
        sessionMaxHours: stored?.sessionMaxHours ?? null,
      },
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
      category: "sign_in_security_failure",
      ipAddress: getClientIpAddress(request.headers),
      message: "Unexpected failure while changing sign-in security.",
      path: getRequestPathname(request),
      userId: session.user.id,
    });

    return NextResponse.json(
      { error: "That change could not be saved." },
      { headers: noStore, status: 500 },
    );
  }
}
