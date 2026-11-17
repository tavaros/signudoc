import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { after, before, beforeEach, test } from "node:test";

import type pg from "pg";

import {
  type BackupBlob,
  type BackupStore,
  DATABASE_PREFIX,
  findLatestDatabaseBackup,
  restoreDatabase,
  restoreFiles,
  RestoreError,
  runBackup,
} from "./backup.ts";
import { openTestDatabase } from "./db/test-database.ts";
import { recordSystemAuditEvent } from "./services/system-audit.ts";
import { saveSettings } from "./settings.ts";

// The daily backup and its restore, against a real Postgres and an
// in-memory stand-in for two Blob stores. Run with `npm run test:db`.

let database: pg.Pool;

type Stored = { body: Buffer; contentType: string; uploadedAt: Date };

/** A Blob store kept in memory. `clock` decides each upload's time. */
function memoryStore(clock: () => Date = () => new Date()) {
  const objects = new Map<string, Stored>();

  async function toBuffer(
    body: ReadableStream<Uint8Array> | Readable | Buffer | string,
  ): Promise<Buffer> {
    if (typeof body === "string") {
      return Buffer.from(body);
    }

    if (Buffer.isBuffer(body)) {
      return body;
    }

    const chunks: Buffer[] = [];
    const readable =
      body instanceof Readable
        ? body
        : Readable.fromWeb(body as import("node:stream/web").ReadableStream);

    for await (const chunk of readable) {
      chunks.push(Buffer.from(chunk as Uint8Array));
    }

    return Buffer.concat(chunks);
  }

  const store: BackupStore & { objects: Map<string, Stored> } = {
    async delete(pathnames) {
      for (const pathname of pathnames) {
        objects.delete(pathname);
      }
    },
    async get(pathname) {
      const found = objects.get(pathname);

      return found
        ? {
            contentType: found.contentType,
            stream: new Blob([new Uint8Array(found.body)]).stream(),
          }
        : null;
    },
    async list({ prefix }) {
      const blobs: BackupBlob[] = [...objects]
        .filter(([pathname]) => !prefix || pathname.startsWith(prefix))
        .map(([pathname, stored]) => ({
          pathname,
          size: stored.body.length,
          uploadedAt: stored.uploadedAt,
        }));

      return { blobs, hasMore: false };
    },
    objects,
    async put(pathname, body, { contentType }) {
      objects.set(pathname, {
        body: await toBuffer(body),
        contentType,
        uploadedAt: clock(),
      });
    },
  };

  return store;
}

async function addUser(email: string) {
  const id = randomUUID();

  await database.query(
    `insert into "user" (id, name, email, "emailVerified", role) values ($1, 'Pat', $2, true, 'admin')`,
    [id, email],
  );

  return id;
}

async function clearTables() {
  await database.query(`truncate public."user" cascade`);
  await database.query("delete from public.system_audit_events");
  await database.query("delete from public.app_settings");
}

before(async () => {
  database = await openTestDatabase();
});

beforeEach(clearTables);

after(async () => {
  await clearTables();
  await database.end();
});

test("a backup restores into an empty database exactly as it was", async () => {
  const userId = await addUser("pat@acme.com");

  await saveSettings(
    { organizationName: "Acme Corp", supportAddress: "help@acme.com" },
    database,
  );
  await recordSystemAuditEvent(
    {
      actorEmail: "pat@acme.com",
      actorUserId: userId,
      event: "settings_changed",
      metadata: { changes: ["organization_name"] },
    },
    database,
  );

  const before = await database.query(
    "select * from system_audit_events order by sequence",
  );
  const source = memoryStore();
  const target = memoryStore();

  source.objects.set("envelopes/a/original.pdf", {
    body: Buffer.from("%PDF-1.7 original"),
    contentType: "application/pdf",
    uploadedAt: new Date(),
  });

  const summary = await runBackup({
    database,
    keepDays: 30,
    source,
    target,
  });

  assert.equal(summary.filesCopied, 1);
  assert.equal(summary.stoppedEarly, false);
  assert.ok(target.objects.has("files/envelopes/a/original.pdf"));

  // Something goes badly wrong: the rows and the file are gone.
  await clearTables();
  source.objects.clear();

  const backupPath = await findLatestDatabaseBackup(target);

  assert.equal(backupPath, summary.databaseBackup);

  const restored = await restoreDatabase({
    backupPath: backupPath ?? "",
    database,
    store: target,
  });

  assert.equal(restored.rows.user, 1);

  const after = await database.query(
    "select * from system_audit_events order by sequence",
  );

  assert.deepEqual(after.rows, before.rows);

  const settings = await database.query<{ organization_name: string }>(
    "select organization_name from app_settings",
  );

  assert.equal(settings.rows[0]?.organization_name, "Acme Corp");

  const files = await restoreFiles({ source: target, target: source });

  assert.equal(files.copied, 1);
  assert.equal(
    source.objects.get("envelopes/a/original.pdf")?.body.toString(),
    "%PDF-1.7 original",
  );
});

test("a restore refuses a database that already has accounts", async () => {
  await addUser("pat@acme.com");

  const target = memoryStore();
  const summary = await runBackup({
    database,
    keepDays: 30,
    source: memoryStore(),
    target,
  });

  await assert.rejects(
    restoreDatabase({
      backupPath: summary.databaseBackup,
      database,
      store: target,
    }),
    RestoreError,
  );
});

test("only new or changed files are copied, and a deleted file's copy goes after the keep days", async () => {
  let now = new Date("2026-11-01T08:00:00Z");
  const clock = () => now;
  const source = memoryStore(clock);
  const target = memoryStore(clock);

  await source.put("a.pdf", Buffer.from("a"), {
    contentType: "application/pdf",
  });
  await source.put("b.pdf", Buffer.from("b"), {
    contentType: "application/pdf",
  });

  const first = await runBackup({
    database,
    keepDays: 2,
    now,
    source,
    target,
  });

  assert.equal(first.filesCopied, 2);

  // A day later: b is written again, a is deleted.
  now = new Date("2026-11-02T08:00:00Z");
  await source.put("b.pdf", Buffer.from("b, signed"), {
    contentType: "application/pdf",
  });
  await source.delete(["a.pdf"]);

  const second = await runBackup({
    database,
    keepDays: 2,
    now,
    source,
    target,
  });

  assert.equal(second.filesCopied, 1);
  assert.equal(second.filesRemoved, 0);
  assert.equal(target.objects.get("files/b.pdf")?.body.toString(), "b, signed");
  assert.ok(target.objects.has("files/a.pdf"), "kept for now");

  now = new Date("2026-11-05T08:00:00Z");

  const third = await runBackup({
    database,
    keepDays: 2,
    now,
    source,
    target,
  });

  assert.equal(third.filesCopied, 0);
  assert.equal(third.filesUnchanged, 1);
  assert.equal(third.filesRemoved, 1);
  assert.ok(!target.objects.has("files/a.pdf"));

  // Three database copies are always kept, however old.
  const databaseCopies = [...target.objects.keys()].filter((pathname) =>
    pathname.startsWith(DATABASE_PREFIX),
  );

  assert.equal(databaseCopies.length, 3);
});

test("copying stops at the deadline and the next run carries on", async () => {
  const source = memoryStore();
  const target = memoryStore();

  for (const name of ["a", "b", "c"]) {
    await source.put(`${name}.pdf`, Buffer.from(name), {
      contentType: "application/pdf",
    });
  }

  const stopped = await runBackup({
    database,
    deadline: Date.now() - 1,
    keepDays: 30,
    source,
    target,
  });

  assert.equal(stopped.stoppedEarly, true);
  assert.equal(stopped.filesCopied, 0);

  const resumed = await runBackup({
    database,
    keepDays: 30,
    source,
    target,
  });

  assert.equal(resumed.filesCopied, 3);
});

test("text outside ASCII comes back whole, even where it spans two chunks", async () => {
  // Long enough that the decompressed backup reaches the reader in several
  // chunks, with two-byte and four-byte characters across their edges.
  const name = "Zoë Ångström 名前 🖋️ ".repeat(6000);
  const id = randomUUID();

  await database.query(
    `insert into "user" (id, name, email, "emailVerified", role) values ($1, $2, 'zoe@acme.com', true, 'admin')`,
    [id, name],
  );

  const target = memoryStore();
  const summary = await runBackup({
    database,
    keepDays: 30,
    source: memoryStore(),
    target,
  });

  await clearTables();
  await restoreDatabase({
    backupPath: summary.databaseBackup,
    database,
    store: target,
  });

  const restored = await database.query<{ name: string }>(
    `select name from "user" where id = $1`,
    [id],
  );

  assert.equal(restored.rows[0]?.name, name);
});

test("a database that cannot be read fails the backup instead of hanging it", async () => {
  const broken = {
    connect: () => Promise.reject(new Error("connection refused")),
  } as unknown as pg.Pool;

  await assert.rejects(
    runBackup({
      database: broken,
      keepDays: 30,
      source: memoryStore(),
      target: memoryStore(),
    }),
    /connection refused/,
  );
});

test("a manifest that cannot be read stops the run rather than starting over", async () => {
  const target = memoryStore();

  await target.put("manifest.json", "{ not json", {
    contentType: "application/json",
  });

  await assert.rejects(
    runBackup({
      database,
      keepDays: 30,
      source: memoryStore(),
      target,
    }),
    SyntaxError,
  );
  assert.equal(
    target.objects.get("manifest.json")?.body.toString(),
    "{ not json",
  );
});

test("copying files back skips the ones a stopped run already copied", async () => {
  const backup = memoryStore();
  const app = memoryStore();

  await backup.put("files/a.pdf", Buffer.from("aaa"), {
    contentType: "application/pdf",
  });
  await backup.put("files/b.pdf", Buffer.from("bbb"), {
    contentType: "application/pdf",
  });
  await app.put("a.pdf", Buffer.from("aaa"), {
    contentType: "application/pdf",
  });

  const result = await restoreFiles({ source: backup, target: app });

  assert.deepEqual(result, { copied: 1, failures: [], skipped: 1 });
  assert.equal(app.objects.get("b.pdf")?.body.toString(), "bbb");
});

test("a file written again at the same size is copied again", async () => {
  let now = new Date("2026-11-01T08:00:00Z");
  const clock = () => now;
  const source = memoryStore(clock);
  const target = memoryStore(clock);

  await source.put("a.pdf", Buffer.from("unsigned"), {
    contentType: "application/pdf",
  });
  await runBackup({ database, keepDays: 30, now, source, target });

  // Rewritten in place, the same number of bytes, and the backup's copy is
  // newer than neither: only the recorded version tells them apart.
  now = new Date("2026-11-01T09:00:00Z");
  await source.put("a.pdf", Buffer.from("signed!!"), {
    contentType: "application/pdf",
  });
  target.objects.get("files/a.pdf")!.uploadedAt = new Date(
    "2026-11-01T10:00:00Z",
  );

  const second = await runBackup({
    database,
    keepDays: 30,
    now,
    source,
    target,
  });

  assert.equal(second.filesCopied, 1);
  assert.equal(target.objects.get("files/a.pdf")?.body.toString(), "signed!!");

  const third = await runBackup({
    database,
    keepDays: 30,
    now,
    source,
    target,
  });

  assert.equal(third.filesCopied, 0);
  assert.equal(third.filesUnchanged, 1);
});
