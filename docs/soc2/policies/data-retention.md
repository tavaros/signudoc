# Data retention policy

**Owner:** `[records owner]`.

1. Signed documents, their certificates and audit trails are kept for `[period]`, set under Settings, Organization, and then deleted by the daily cleanup.
2. Drafts that were never sent are deleted after `[the period the app uses]`.
3. A closed account is deleted 30 days after it is closed, once its owner has had the chance to export. Its finished documents pass to an administrator first, because they are the organization's records.
4. Backups keep copies of deleted files for `[30]` days more, then remove them.
5. Copies outside the app (downloads, files in `[record system]`, SIEM logs) follow `[our records schedule]`.
6. A legal hold stops deletion: `[role]` turns retention off for the period (Settings, Organization) and records why. That keeps finished documents only. The daily cleanup still deletes drafts never sent after 30 days and accounts whose closure is due, so for a hold that covers those, `[role]` also pauses the project's cron jobs in Vercel (Settings, Cron Jobs). That pauses the daily backup too; run it by hand while the hold lasts ([Backup and restore](../../backup-and-restore.md)).

**Evidence:** the retention setting, the daily job's summary, the site audit trail.
