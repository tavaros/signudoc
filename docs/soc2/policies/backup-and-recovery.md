# Backup and recovery policy

**Owner:** `[system owner]`.

1. **Objectives:** recovery point `[24 hours]`, recovery time `[N hours]`.
2. **Database:** Neon point-in-time restore on a plan with at least `[7]` days of history.
3. **Daily backup:** SignuDoc's built-in backup copies the database and every file to a private Blob store in the Vercel team `[name]`, separate from the install's team, keeping `[30]` days ([Backup and restore](../../backup-and-restore.md)). Only `[roles]` are members of that team.
4. **Monitoring:** a missing or failed backup raises an alert ([logging and monitoring](logging-and-monitoring.md)).
5. **Restore test:** every `[year]`, `[role]` restores the newest backup into a new Neon project and Blob store, signs in, opens a finished document, checks its audit trail, records the time taken, and deletes the test copy.
6. **Secrets:** `BETTER_AUTH_SECRET` and the backup token are kept in `[password manager]`, readable by `[roles]`, so a restore does not depend on one person.

**Evidence:** the backup store's contents, backup alerts, restore test records.
