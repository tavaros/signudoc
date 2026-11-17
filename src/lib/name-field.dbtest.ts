import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import type pg from "pg";

import { openTestDatabase } from "./db/test-database.ts";
import { ELECTRONIC_RECORDS_DISCLOSURE_VERSION } from "./electronic-records-disclosure.ts";
import type { EmailService } from "./services/email.ts";
import { issueSigningLink } from "./services/signing-links.ts";
import type { StorageService } from "./services/storage.ts";
import { recordSignerConsent, submitSigningForToken } from "./signing.ts";

// A name field against a real Postgres: it is filled in with the signer's
// name when they sign, without the signer sending anything for it.
// Run with `npm run test:db`.

process.env.APP_URL ??= "https://sign.example.test";

let database: pg.Pool;
const createdUsers: string[] = [];

before(async () => {
  database = await openTestDatabase();
  // The next signer's invitation reads the install's name through the shared pool.
  globalThis.__signudocPgPool = database;
});

after(async () => {
  await database.query(`delete from public."user" where id = any($1)`, [
    createdUsers,
  ]);
  await database.end();
});

function unixNow() {
  return Math.floor(Date.now() / 1000);
}

const refuse = async (): Promise<never> => {
  throw new Error("not used");
};

// A typed signature from the first of two signers stores no file and does
// not finish the envelope, so nothing here touches storage.
const storageService: StorageService = {
  deleteObject: refuse,
  getObject: refuse,
  getObjectStream: refuse,
  headObject: refuse,
  putObject: refuse,
};

const emailService: EmailService = {
  async send(message) {
    return { accepted: [message.to], messageId: "m-1", rejected: [] };
  },
  async sendBatch() {
    throw new Error("not used");
  },
};

test("a name field is filled in with the signer's name when they sign", async () => {
  const userId = randomUUID();
  const envelopeId = randomUUID();
  const rileyId = randomUUID();
  const caseyId = randomUUID();
  const signatureId = randomUUID();
  const nameId = randomUUID();
  const now = unixNow();
  const link = await issueSigningLink({ expiresInSeconds: 60, issuedAt: now });

  createdUsers.push(userId);
  await database.query(
    `insert into public."user" (id, name, email, role) values ($1, 'Sam Sender', $2, 'user')`,
    [userId, `${userId}@example.test`],
  );
  await database.query(
    `
      insert into envelopes (
        id, user_id, title, status, source_pdf_key, source_pdf_filename,
        source_pdf_size_bytes, page_count, source_pdf_hash, sent_at
      ) values ($1, $2, 'Lease', 'sent', $3, 'lease.pdf', 10, 1, $4, $5)
    `,
    [envelopeId, userId, `test/${envelopeId}.pdf`, "a".repeat(64), now],
  );
  await database.query(
    `
      insert into signers (
        id, envelope_id, name, email, sign_order, status,
        signing_token_hash, signing_token_expires_at, last_notified_at
      ) values ($1, $2, 'Riley Recipient', $3, 1, 'notified', $4, $5, $6)
    `,
    [
      rileyId,
      envelopeId,
      `${rileyId}@example.test`,
      link.tokenHash,
      link.exp,
      now,
    ],
  );
  await database.query(
    `
      insert into signers (id, envelope_id, name, email, sign_order, status)
      values ($1, $2, 'Casey Second', $3, 2, 'pending')
    `,
    [caseyId, envelopeId, `${caseyId}@example.test`],
  );
  await database.query(
    `
      insert into fields (
        id, envelope_id, signer_id, type, page, x, y, width, height
      ) values
        ($1, $3, $4, 'signature', 1, 0.1, 0.1, 0.2, 0.1),
        ($2, $3, $4, 'name', 1, 0.1, 0.3, 0.2, 0.05)
    `,
    [signatureId, nameId, envelopeId, rileyId],
  );
  await recordSignerConsent(
    link.token,
    { disclosureVersion: ELECTRONIC_RECORDS_DISCLOSURE_VERSION },
    { database },
  );

  // Only the signature is sent: the name is not the signer's to give.
  await submitSigningForToken(
    link.token,
    {
      clientTimezoneOffsetMinutes: 0,
      fields: [
        {
          fieldId: signatureId,
          inputMethod: "typed",
          type: "signature",
          value: "Riley Recipient",
        },
      ],
    },
    { database, emailService, storageService },
  );

  const stored = await database.query<{
    input_method: string | null;
    submitted_at: number | null;
    value: string | null;
  }>(`select input_method, submitted_at, value from fields where id = $1`, [
    nameId,
  ]);

  assert.equal(stored.rows[0]?.value, "Riley Recipient");
  assert.equal(stored.rows[0]?.input_method, "auto");
  assert.ok(stored.rows[0]?.submitted_at);

  const riley = await database.query<{ status: string }>(
    `select status from signers where id = $1`,
    [rileyId],
  );

  assert.equal(riley.rows[0]?.status, "signed");
});
