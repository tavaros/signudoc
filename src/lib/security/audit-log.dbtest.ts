import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

import type pg from "pg";

import { withTransaction } from "../db/connection.ts";
import { openTestDatabase } from "../db/test-database.ts";
import { recordSystemAuditEvent } from "../services/system-audit.ts";

// Audit rows are copied to the function logs as JSON lines once they are
// committed, and only then (logging.ts). Run with `npm run test:db`.

let database: pg.Pool;

before(async () => {
  database = await openTestDatabase();
});

beforeEach(async () => {
  await database.query("delete from public.system_audit_events");
});

after(async () => {
  await database.query("delete from public.system_audit_events");
  await database.end();
});

function auditLines(calls: { arguments: unknown[] }[]) {
  return calls
    .map((call) => call.arguments[0])
    .filter((line): line is string => typeof line === "string")
    .map((line) => JSON.parse(line) as Record<string, unknown>)
    .filter((line) => line.type === "audit");
}

test("a committed audit row is written as one JSON line that matches the row", async (t) => {
  const info = t.mock.method(console, "info", () => undefined);
  const recorded = await recordSystemAuditEvent(
    {
      actorEmail: "pat@acme.com",
      actorUserId: "user-1",
      event: "sign_in_succeeded",
      ipAddress: "203.0.113.7",
      metadata: { method: "password" },
    },
    database,
  );
  const [line] = auditLines(info.mock.calls);
  const { rows } = await database.query<{ row_hash: string }>(
    "select row_hash from system_audit_events where id = $1",
    [recorded.id],
  );

  assert.equal(line?.source, "signudoc");
  assert.equal(line?.trail, "site");
  assert.equal(line?.event, "sign_in_succeeded");
  assert.equal(line?.actorEmail, "pat@acme.com");
  assert.equal(line?.ipAddress, "203.0.113.7");
  assert.equal(line?.sequence, recorded.sequence);
  assert.equal(line?.rowHash, rows[0]?.row_hash);
  assert.deepEqual(line?.metadata, { method: "password" });
});

test("a row that is rolled back is never logged", async (t) => {
  const info = t.mock.method(console, "info", () => undefined);

  await assert.rejects(
    withTransaction(async (client) => {
      await recordSystemAuditEvent(
        { actorEmail: "pat@acme.com", event: "settings_changed" },
        client,
      );

      assert.equal(auditLines(info.mock.calls).length, 0, "not before commit");
      throw new Error("the change failed");
    }, database),
  );

  assert.equal(auditLines(info.mock.calls).length, 0);
});

test("AUDIT_LOG=off stops the lines", async (t) => {
  const info = t.mock.method(console, "info", () => undefined);

  process.env.AUDIT_LOG = "off";
  t.after(() => {
    delete process.env.AUDIT_LOG;
  });

  await recordSystemAuditEvent(
    { actorEmail: "pat@acme.com", event: "settings_changed" },
    database,
  );

  assert.equal(auditLines(info.mock.calls).length, 0);
});
