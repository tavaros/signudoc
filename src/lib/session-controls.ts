import { type DbExecutor, getDb, queryOne } from "./db/connection.ts";

// Session controls, set by an administrator: a session ends after a time
// without use (idle timeout) and at most a set time after sign-in.
//
// Better Auth keeps the session in a signed cookie for a few minutes so most
// requests do not ask the database. That cache cannot know about these
// limits, or that an administrator reset someone's sign-in, so the app's own
// session check (auth/server.ts) also reads the session's row each time, and
// treats a row that is gone, or past a limit, as signed out.

export {
  SESSION_IDLE_CHOICES,
  SESSION_MAX_HOURS_CHOICES,
} from "./session-choices.ts";

/** Use is written down at most this often, to keep writes rare. */
const ACTIVITY_WRITE_INTERVAL_SECONDS = 60;

export type SessionLimits = {
  sessionIdleMinutes: number | null;
  sessionMaxHours: number | null;
};

export type SessionRow = {
  createdAt: Date;
  lastActiveAt: number | null;
};

export type SessionCheck =
  | { ok: true; touch: boolean }
  | { ok: false; reason: "gone" | "idle" | "too_old" };

/** Whether a session may still be used now. Pure, for testing. */
export function checkSession(
  row: SessionRow | null,
  limits: SessionLimits,
  nowSeconds: number,
): SessionCheck {
  if (!row) {
    return { ok: false, reason: "gone" };
  }

  const createdAt = Math.floor(row.createdAt.getTime() / 1000);
  const lastActiveAt = row.lastActiveAt ?? createdAt;

  if (
    limits.sessionMaxHours !== null &&
    nowSeconds - createdAt >= limits.sessionMaxHours * 3600
  ) {
    return { ok: false, reason: "too_old" };
  }

  if (
    limits.sessionIdleMinutes !== null &&
    nowSeconds - lastActiveAt >= limits.sessionIdleMinutes * 60
  ) {
    return { ok: false, reason: "idle" };
  }

  return {
    ok: true,
    touch: nowSeconds - lastActiveAt >= ACTIVITY_WRITE_INTERVAL_SECONDS,
  };
}

/**
 * Checks a session against the install's limits, records its use, and ends
 * it when a limit is passed. True when it may be used.
 */
export async function enforceSessionLimits(
  token: string,
  limits: SessionLimits,
  options: { database?: DbExecutor; nowSeconds?: number } = {},
): Promise<boolean> {
  const database = options.database ?? getDb();
  const nowSeconds = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  const row = await queryOne<SessionRow>(
    database,
    `
      SELECT "createdAt" AS "createdAt", last_active_at AS "lastActiveAt"
      FROM session
      WHERE token = $1
    `,
    [token],
  );
  const check = checkSession(row, limits, nowSeconds);

  if (!check.ok) {
    if (check.reason !== "gone") {
      await database.query(`DELETE FROM session WHERE token = $1`, [token]);
    }

    return false;
  }

  if (check.touch) {
    await database.query(
      `UPDATE session SET last_active_at = $2 WHERE token = $1`,
      [token, nowSeconds],
    );
  }

  return true;
}

/** Reads a choice from a request body: a listed number, or null for "off". */
export function parseSessionLimit(
  value: unknown,
  choices: readonly number[],
): number | null | undefined {
  if (value === null) {
    return null;
  }

  if (typeof value === "number" && choices.includes(value)) {
    return value;
  }

  return undefined;
}
