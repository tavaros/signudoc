import {
  type DbExecutor,
  type DbPool,
  getDb,
  queryOne,
  withTransaction,
} from "./db/connection.ts";
import {
  clearRateLimit,
  consumeRateLimit,
  peekRateLimit,
} from "./security/rate-limit.ts";
import { recordSystemAuditEvent } from "./services/system-audit.ts";

// Sign-in security for the people who use the app (senders and
// administrators, not signers, who open their envelopes from an emailed
// link):
//
// - Two-step sign-in: an authenticator app code, or one of ten single-use
//   backup codes, after the password. Better Auth's two-factor plugin does
//   the work (auth/server.ts); this module holds the install's rules.
// - An administrator can require two-step sign-in of everyone. Until a
//   person has set it up, the app shows them nothing but the setup.
// - Ten wrong passwords for one email address within fifteen minutes stop
//   sign-in for that address until the fifteen minutes are up. The count is
//   kept per address whether or not an account has it, so the answer says
//   nothing about which addresses have accounts.
// - Sign-ins, failures, lockouts and changes to how someone signs in go in
//   the install's audit trail (services/system-audit.ts).

export const MAX_FAILED_SIGN_INS = 10;
export const SIGN_IN_LOCKOUT_MS = 15 * 60 * 1000;

export const SIGN_IN_LOCKED_MESSAGE =
  "Too many wrong passwords for this email address. Try again in 15 minutes, or reset your password.";

export class SignInSecurityError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "SignInSecurityError";
    this.statusCode = statusCode;
  }
}

function failedSignInKey(email: string): string {
  return `sign-in-failures:${email.trim().toLowerCase()}`;
}

export type SignInLockState =
  { locked: false } | { locked: true; retryAfterSeconds: number };

/** Whether sign-in for this address is stopped by wrong passwords. */
export async function getSignInLockState(
  email: string,
  options: { database?: DbExecutor; now?: number } = {},
): Promise<SignInLockState> {
  const decision = await peekRateLimit(
    {
      key: failedSignInKey(email),
      limit: MAX_FAILED_SIGN_INS,
      now: options.now,
    },
    { database: options.database },
  );

  return decision.allowed
    ? { locked: false }
    : { locked: true, retryAfterSeconds: decision.retryAfterSeconds };
}

/**
 * Counts a wrong password for this address. `justLocked` is true for the
 * one that used up the allowance, so the lockout is recorded once.
 */
export async function countFailedSignIn(
  email: string,
  options: { database?: DbExecutor; now?: number } = {},
): Promise<{ failures: number; justLocked: boolean }> {
  const decision = await consumeRateLimit(
    {
      key: failedSignInKey(email),
      limit: MAX_FAILED_SIGN_INS,
      now: options.now,
      windowMs: SIGN_IN_LOCKOUT_MS,
    },
    { database: options.database },
  );

  return {
    failures: decision.count,
    justLocked: decision.count === MAX_FAILED_SIGN_INS,
  };
}

/** Forgets the wrong passwords for this address after a sign-in worked. */
export async function clearFailedSignIns(
  email: string,
  options: { database?: DbExecutor } = {},
): Promise<void> {
  await clearRateLimit(failedSignInKey(email), options);
}

/**
 * Whether this person must set up two-step sign-in before using the app.
 * `twoFactorEnabled` comes from the session, which is at most a few minutes
 * old; the setup itself replaces the session, so it is current right after.
 *
 * It applies to password sign-in. Someone with no password, who only signs
 * in through the organization's identity provider (auth/sso.ts), has the
 * provider's own MFA as their second step, and could not set one up here.
 */
export async function needsTwoFactorSetup(
  settings: { requireTwoFactor: boolean },
  user: object,
  options: { database?: DbExecutor } = {},
): Promise<boolean> {
  if (!settings.requireTwoFactor || usesTwoFactor(user)) {
    return false;
  }

  const userId = "id" in user && typeof user.id === "string" ? user.id : null;

  if (!userId) {
    return true;
  }

  const password = await queryOne<{ found: number }>(
    options.database ?? getDb(),
    `SELECT 1 AS found FROM account WHERE "userId" = $1 AND "providerId" = 'credential' LIMIT 1`,
    [userId],
  );

  return password !== null;
}

/**
 * Whether a session's user has two-step sign-in on. The field is added by
 * the two-factor plugin, which the session's static type does not carry.
 */
export function usesTwoFactor(user: object): boolean {
  return (
    "twoFactorEnabled" in user &&
    (user as { twoFactorEnabled?: unknown }).twoFactorEnabled === true
  );
}

type Actor = {
  email: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  userId: string;
};

async function lockActor(actor: Actor, tx: DbExecutor) {
  const row = await queryOne<{ role: string; twoFactorEnabled: boolean }>(
    tx,
    `SELECT role, "twoFactorEnabled" AS "twoFactorEnabled" FROM "user" WHERE id = $1`,
    [actor.userId],
  );

  if (row?.role !== "admin") {
    throw new SignInSecurityError("Only an administrator can do this.", 403);
  }

  return row;
}

/**
 * Turns the two-step sign-in requirement on or off. The administrator who
 * turns it on must already use two-step sign-in, so the switch is never
 * flipped by someone who has not tried what everyone else will be asked to
 * do.
 */
export async function setTwoFactorRequirement(
  actor: Actor,
  required: boolean,
  database: DbPool = getDb(),
): Promise<void> {
  const { readStoredSettings, saveSettings } = await import("./settings.ts");

  await withTransaction(async (tx) => {
    const actorRow = await lockActor(actor, tx);

    // Settings are one row; holding it keeps two changes from crossing.
    await tx.query(`SELECT id FROM app_settings WHERE id FOR UPDATE`);

    const current = await readStoredSettings(tx);
    const wasRequired = current?.requireTwoFactor ?? false;

    if (wasRequired === required) {
      return;
    }

    if (
      required &&
      !actorRow.twoFactorEnabled &&
      (await needsTwoFactorSetup(
        { requireTwoFactor: true },
        { id: actor.userId },
        { database: tx },
      ))
    ) {
      throw new SignInSecurityError(
        "Set up two-step sign-in for your own account first, under Settings, Two-step sign-in.",
        409,
      );
    }

    await saveSettings({ requireTwoFactor: required }, tx);
    await recordSystemAuditEvent(
      {
        actorEmail: actor.email,
        actorUserId: actor.userId,
        event: "two_factor_requirement_changed",
        ipAddress: actor.ipAddress ?? null,
        metadata: { from: wasRequired, to: required },
        userAgent: actor.userAgent ?? null,
      },
      tx,
    );
  }, database);
}

/**
 * For someone who lost their authenticator and their backup codes: an
 * administrator turns their two-step sign-in off and signs them out
 * everywhere. They sign in with their password and set it up again (at
 * once, if the install requires it).
 */
export async function resetTwoFactor(
  actor: Actor,
  targetUserId: string,
  database: DbPool = getDb(),
): Promise<void> {
  await withTransaction(async (tx) => {
    await lockActor(actor, tx);

    const target = await queryOne<{
      email: string;
      name: string;
      twoFactorEnabled: boolean;
    }>(
      tx,
      `
        SELECT email, name, "twoFactorEnabled" AS "twoFactorEnabled"
        FROM "user"
        WHERE id = $1
        FOR UPDATE
      `,
      [targetUserId],
    );

    if (!target) {
      throw new SignInSecurityError("That account no longer exists.", 404);
    }

    if (!target.twoFactorEnabled) {
      throw new SignInSecurityError(
        "This person does not use two-step sign-in.",
        409,
      );
    }

    await tx.query(`DELETE FROM "twoFactor" WHERE "userId" = $1`, [
      targetUserId,
    ]);
    await tx.query(
      `UPDATE "user" SET "twoFactorEnabled" = false, "updatedAt" = now() WHERE id = $1`,
      [targetUserId],
    );
    // Trusted-device marks are kept as verification rows with the user's id
    // as their value.
    await tx.query(
      `DELETE FROM verification WHERE identifier LIKE 'trust-device-%' AND value = $1`,
      [targetUserId],
    );
    await tx.query(`DELETE FROM session WHERE "userId" = $1`, [targetUserId]);
    await recordSystemAuditEvent(
      {
        actorEmail: actor.email,
        actorUserId: actor.userId,
        event: "two_factor_reset",
        ipAddress: actor.ipAddress ?? null,
        metadata: { targetEmail: target.email, targetName: target.name },
        targetUserId,
        userAgent: actor.userAgent ?? null,
      },
      tx,
    );
  }, database);
}

/**
 * Sets how long sessions may go unused and how long they may last. Applies
 * to sessions that are already open too, from their next request.
 */
export async function setSessionLimits(
  actor: Actor,
  limits: {
    sessionIdleMinutes: number | null;
    sessionMaxHours: number | null;
  },
  database: DbPool = getDb(),
): Promise<void> {
  const { readStoredSettings, saveSettings } = await import("./settings.ts");

  await withTransaction(async (tx) => {
    await lockActor(actor, tx);
    await tx.query(`SELECT id FROM app_settings WHERE id FOR UPDATE`);

    const current = await readStoredSettings(tx);
    const changes: Record<string, { from: number | null; to: number | null }> =
      {};

    for (const field of ["sessionIdleMinutes", "sessionMaxHours"] as const) {
      const from = current?.[field] ?? null;

      if (from !== limits[field]) {
        changes[field] = { from, to: limits[field] };
      }
    }

    if (Object.keys(changes).length === 0) {
      return;
    }

    await saveSettings(limits, tx);
    await recordSystemAuditEvent(
      {
        actorEmail: actor.email,
        actorUserId: actor.userId,
        event: "settings_changed",
        ipAddress: actor.ipAddress ?? null,
        metadata: { changes },
        userAgent: actor.userAgent ?? null,
      },
      tx,
    );
  }, database);
}
