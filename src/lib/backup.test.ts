import assert from "node:assert/strict";
import { test } from "node:test";

import { isBackupStoreTheAppStore, readBackupSettings } from "./backup.ts";

test("backups are off until a backup store token is set", () => {
  assert.equal(readBackupSettings({}), null);
  assert.deepEqual(
    readBackupSettings({ BACKUP_BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_B_x" }),
    { keepDays: 30, token: "vercel_blob_rw_B_x" },
  );

  for (const [value, expected] of [
    ["7", 7],
    ["0", 30],
    ["many", 30],
    ["99999", 30],
  ] as const) {
    assert.equal(
      readBackupSettings({
        BACKUP_BLOB_READ_WRITE_TOKEN: "t",
        BACKUP_KEEP_DAYS: value,
      })?.keepDays,
      expected,
    );
  }
});

test("a backup token for the app's own store is caught", () => {
  const settings = { keepDays: 30, token: "vercel_blob_rw_AbC123_secret" };

  assert.equal(
    isBackupStoreTheAppStore(settings, {
      BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_abc123_other",
    }),
    true,
  );
  assert.equal(
    isBackupStoreTheAppStore(settings, { BLOB_STORE_ID: "store_AbC123" }),
    true,
  );
  assert.equal(
    isBackupStoreTheAppStore(settings, {
      BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_Other9_x",
    }),
    false,
  );
});
