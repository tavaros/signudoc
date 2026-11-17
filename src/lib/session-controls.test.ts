import assert from "node:assert/strict";
import { test } from "node:test";

import { checkSession, parseSessionLimit } from "./session-controls.ts";
import { SESSION_IDLE_CHOICES } from "./session-choices.ts";

const CREATED = new Date("2026-11-17T09:00:00Z");
const createdSeconds = Math.floor(CREATED.getTime() / 1000);
const noLimits = { sessionIdleMinutes: null, sessionMaxHours: null };

test("a session that is gone does not count", () => {
  assert.deepEqual(checkSession(null, noLimits, createdSeconds), {
    ok: false,
    reason: "gone",
  });
});

test("without limits a session lasts, and its use is written once a minute", () => {
  const row = { createdAt: CREATED, lastActiveAt: createdSeconds + 3600 };

  assert.deepEqual(checkSession(row, noLimits, createdSeconds + 3630), {
    ok: true,
    touch: false,
  });
  assert.deepEqual(checkSession(row, noLimits, createdSeconds + 3660), {
    ok: true,
    touch: true,
  });
});

test("an idle session ends, counted from its last use or else its start", () => {
  const limits = { sessionIdleMinutes: 30, sessionMaxHours: null };

  assert.equal(
    checkSession(
      { createdAt: CREATED, lastActiveAt: null },
      limits,
      createdSeconds + 29 * 60,
    ).ok,
    true,
  );
  assert.deepEqual(
    checkSession(
      { createdAt: CREATED, lastActiveAt: null },
      limits,
      createdSeconds + 30 * 60,
    ),
    { ok: false, reason: "idle" },
  );
  assert.equal(
    checkSession(
      { createdAt: CREATED, lastActiveAt: createdSeconds + 3600 },
      limits,
      createdSeconds + 3600 + 29 * 60,
    ).ok,
    true,
  );
});

test("a session ends at its maximum length however busy it is", () => {
  const limits = { sessionIdleMinutes: 15, sessionMaxHours: 8 };

  assert.deepEqual(
    checkSession(
      { createdAt: CREATED, lastActiveAt: createdSeconds + 8 * 3600 - 10 },
      limits,
      createdSeconds + 8 * 3600,
    ),
    { ok: false, reason: "too_old" },
  );
});

test("only listed limits, or null for none, are accepted", () => {
  assert.equal(parseSessionLimit(30, SESSION_IDLE_CHOICES), 30);
  assert.equal(parseSessionLimit(null, SESSION_IDLE_CHOICES), null);
  assert.equal(parseSessionLimit(31, SESSION_IDLE_CHOICES), undefined);
  assert.equal(parseSessionLimit("30", SESSION_IDLE_CHOICES), undefined);
  assert.equal(parseSessionLimit(undefined, SESSION_IDLE_CHOICES), undefined);
});
