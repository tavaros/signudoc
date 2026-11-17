# Logging and monitoring policy

**Owner:** `[security owner]`.

1. A Vercel log drain sends the install's function logs to `[SIEM]`, which keeps them for `[1 year]`.
2. Alerts go to `[channel or on-call]` for these lines (each is JSON with `"source": "signudoc"`):
   - `type` `audit`, `event` `sign_in_locked`: repeated wrong passwords for one address.
   - More than `[20]` `sign_in_failed` in `[10 minutes]`: a guessing attack.
   - `role_changed`, `two_factor_requirement_changed`, `settings_changed`, `part11_mode_changed`: a change to who can do what. Confirmed with the person who made it.
   - `type` `security`, `category` `backup_failure`, `backup_finished` with `level` `error`, or `retention_job_failure`: a daily job failed.
   - No `backup_finished` line in `[26 hours]`: the backup did not run.
3. Every `[month]`, `[role]` checks that both audit chains are intact (Settings, Organization, Sign-in security; and a sample of documents), downloads the site audit trail CSV and files it in `[location]`, and looks for anything unexpected.
4. An alert that is not explained becomes an incident.

**Evidence:** the drain and alert configuration, alert tickets, the monthly review record.
