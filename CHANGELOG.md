# Changelog

All notable changes to SignuDoc are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/). Until 1.0, a minor release may
change settings or the database in ways that need a migration step; each
release says when it does.

## [Unreleased]

## [0.4.0] - 2026-11-17

A name field, and fixes for nine reported bugs. This release changes the
database: see the end of this entry.

### Envelopes

- A name field. Place it where the signer's printed name belongs, and it is
  filled in with the name the sender gave that signer when they sign, the
  way a date field is filled in with the day. It is always required, and the
  signer does not type it. Contributed by @sumnerboy12 (#49, PR #50).

### Fixes

- The certificate's "sent" and reminder rows name the sender, not the first
  signer next to the sender's email address (#52).
- Sending or reminding when email is not set up says so, instead of failing
  with a generic server error. A manual reminder no longer retires the
  signer's link before finding there is no email to send it with (#53).
- A password-locked PDF is named as locked on upload, instead of being
  reported as a file that could not be rendered (#54).
- After a signer declines, the page says the decline was recorded, instead
  of "This link has expired" (#55).
- Setup refuses a password over 128 characters instead of silently cutting
  it short, which made the next sign-in fail (#56).
- Sign-in and sign-up say a password is too long, instead of "too short" or
  "something went wrong" (#57).
- Typed signatures in the script font keep every letter when the text is
  copied or searched, and no longer show gaps inside names where the font
  joins letters (#58, #59).

### Documentation

- The agent deploy guide checks Vercel's rule that the free Hobby plan is
  for non-commercial use before choosing free plans for a company (#47).

Thanks to @coygeek for the detailed bug reports, and to @sumnerboy12 for the
name field.

This release changes the database (`20261118090000_name_field.sql`). On
Vercel the production build applies it. On other hosts, run
`npm run db:migrate` as on every deploy.

## [0.3.0] - 2026-11-16

Sign-in security and audit features for organizations that need them, and
two new ways to fix a sent envelope. This release changes the database: see
the end of this entry.

### Envelopes

- A sender can correct a signer's email address after sending. The old
  signing link stops working, the new address gets a fresh invitation, and
  the audit trail records the correction.
- A finished envelope can be copied into a new draft with the same document,
  recipients and fields, and nothing that was filled in.

### Sign-in security

- Two-step sign-in: anyone with an account can add an authenticator app
  under Settings, with ten single-use backup codes. Signing in then asks for
  a code after the password.
- Administrators can require two-step sign-in of everyone (Settings,
  Organization, Sign-in security), and reset it for someone who lost their
  phone (People).
- Session limits: administrators can sign people out after a time without
  use (15 minutes to 8 hours) and at the latest a set time after sign-in
  (8 hours to 3 days). Anyone can sign out on every device at once.
- A session that was ended (signed out everywhere, or reset by an
  administrator) stops working at once, not when the short-lived session
  cookie runs out.
- Ten wrong passwords for one email address within 15 minutes stop sign-in
  for that address for 15 minutes.
- The site audit trail now records sign-ins, failed sign-ins, lockouts,
  sign-outs, password changes and resets, two-step sign-in changes, logo
  changes and the email domain being added. It moved from the Part 11 panel
  to the new Sign-in security panel, and is there whether or not Part 11
  mode is on.
- Single sign-on over OpenID Connect (Okta, Microsoft Entra ID, Google
  Workspace and others), set up with `SSO_ISSUER`, `SSO_CLIENT_ID` and
  `SSO_CLIENT_SECRET`. New people get an account under the install's
  sign-up rule. `PASSWORD_SIGN_IN=off` then turns password sign-in off,
  except for the addresses in `PASSWORD_SIGN_IN_ALLOWED_EMAILS`.
- Audit rows (site and document trails) and security events are written to
  the function logs as JSON lines once saved, so a Vercel log drain can
  deliver them to a SIEM. `AUDIT_LOG=off` stops the audit lines.
- A daily backup of the database and files to a second, private Blob store,
  turned on with `BACKUP_BLOB_READ_WRITE_TOKEN`, and `npm run restore-backup`
  to restore it into a new database and store. See
  `docs/backup-and-restore.md`. `vercel.json` has a second daily cron job,
  which does nothing until the token is set.

- Account closure requests and account deletions are recorded in the site
  audit trail.
- `docs/soc2`: a SOC 2 pack for organizations that put an install in their
  audit: a control map to the Trust Services Criteria, vendor duties,
  questionnaire answers and sample policies.

### Project security

- CodeQL, dependency review, a weekly `npm audit` and OpenSSF Scorecard run
  on the SignuDoc repository (skipped in a copy made by the Deploy button).
- Each release gets a CycloneDX SBOM, a source archive and signed build
  provenance attached. `SECURITY.md` says how to verify them.

This release changes the database (`20261115100000_copied_audit_event.sql`,
`20261116100000_signer_corrected.sql`, `20261117090000_sign_in_security.sql`,
`20261117100000_session_controls.sql`). On Vercel the production build
applies them, so nothing is needed by hand. On other hosts, run
`npm run db:migrate` as on every deploy.

## [0.2.1] - 2026-11-16

A smoother first deploy. No database change: this release needs no
migration step.

### Deploying

- The Deploy button adds Resend first, then Neon and Blob, so Resend's
  sending domain has longer to be ready before the first deployment starts.
- The README and the self-hosting guide say what to do when Vercel stops the
  first deployment with "One or more integration resources failed to
  provision": wait, refresh and redeploy.
- New [guide for AI agents](docs/deploy-with-an-agent.md) that deploy
  SignuDoc for someone through their browser.
- The README's button now reads "Deploy to Vercel", with "or copy this to
  your LLM" under it, linking to that guide.

## [0.2.0] - 2026-11-15

Installs can now find and take new releases without using git. No database
change: this release needs no migration step.

### Keeping an install up to date

- **Check for updates** in Settings, SignuDoc (administrators only): shows
  the version the site runs, asks GitHub for the latest release, and shows
  what is new in it.
- **Update SignuDoc workflow** (`.github/workflows/update-signudoc.yml`) in
  each copy: runs every Monday or by hand, merges the new release with the
  copy on a `signudoc-update/<version>` branch and opens a pull request, so
  Vercel builds a preview first. Changes you made to the code are kept; where
  you and SignuDoc changed the same lines it stops and lists the files. It
  never force-pushes.
- Optional settings for the workflow: a `SIGNUDOC_UPDATE_TOKEN` secret so it
  can update workflow files too, `SIGNUDOC_AUTO_MERGE=1` to merge clean
  updates straight into production, and `SIGNUDOC_PRODUCTION_BRANCH` when
  Vercel deploys from a branch other than the default one.
- `docs/self-hosting.md` explains the workflow and a by-hand update for a
  Deploy-button copy, which shares no history with this project.

### Upgrading from 0.1.0

A copy made from 0.1.0 does not have the update workflow yet. Add
`.github/workflows/update-signudoc.yml` to it once (Settings in SignuDoc
links to the right page, and `docs/self-hosting.md` has the steps), then run
it. If it asks which version you deployed, use `v0.1.0`.

### Other changes

- The Code of Conduct file is removed.

### Not yet verified

- The update workflow is tested in CI against stand-in repositories. A real
  run in a Deploy-button copy has not been done yet.
- Everything listed under 0.1.0 as not yet verified still is.

## [0.1.0] - 2026-11-14

The first open-source release. SignuDoc is an e-signature platform that an
organization deploys to its own Vercel account and runs on free plans.

### Deploy and run it yourself

- One-click **Deploy to Vercel** button that provisions Neon Postgres, Vercel
  Blob and Resend from the Vercel Marketplace, all on their free plans.
  Vercel keeps its free Hobby plan for personal, non-commercial use, so a
  company belongs on Vercel Pro ($20 a month, whatever its size).
- Setup wizard on first visit: creates the first administrator, asks for the
  install's own support email, and fills in the email sending domain (with a
  `sign.` subdomain by default).
- Daily Vercel cron for reminders, deadlines and retention, rate limits kept
  in Postgres, and optional Vercel BotID (`BOTID=1`).
- Runs locally with no outside services for development and tests.
- Copyright Nyllon Software, released under the license in `LICENSE`.

### Sending and signing

- Soft Studio interface for the dashboard, field placement, envelopes and the
  signing page, with first-page thumbnails and a phone layout.
- Signers sign without an account. A signer's extra check is one choice: an
  emailed code or an access code.
- Text, date, number, checkbox, dropdown and radio fields; signing order;
  CC recipients; deadlines with expiry; optional reminders.
- Templates for documents sent often ("Save as template", "Use template").
- Branding with your own name, logo and color, and an administrators panel.

### Records you can rely on

- Electronic-records consent disclosure and a permitted-use list, both
  versioned, to meet US ESIGN/UETA and EU eIDAS expectations for simple
  electronic signatures.
- Hash-chained audit trail and a completion certificate on every envelope.
- Finished documents sealed with a PAdES signature (an install's own key, or
  your certificate through `SEAL_P12_BASE64`), with an RFC 3161 timestamp when
  `SEAL_TIMESTAMP_URL` is set.
- PAdES B-LT and B-LTA: revocation data and a document timestamp are added
  after the seal so it stays checkable for years.
- Retention settings with a warning before anything is deleted, and signer
  erasure requests.

### Regulated use

- **Part 11 mode** for FDA 21 CFR Part 11 records: signers sign from a
  verified account and enter their password at signing, each signature
  carries its meaning, and settings changes go to their own audit chain with
  CSV export. A validation pack in `docs/part11/` gives an install a start on
  its own validation.
- **Signer advanced and qualified signatures (AdES/QES)**: a signer can sign in
  their own name through eID Easy or any Cloud Signature Consortium (CSC v2)
  provider, with the result embedded in the PDF.

### Not yet verified

These parts are built and tested against stand-ins in CI, but have not been
checked against the real services:

- A full Deploy-button pass on a clean Vercel account, step by step against the
  README. A first run surfaced Vercel's "Needs Attention" badge on Neon
  variables, which `docs/self-hosting.md` now explains.
- Live eID Easy and CSC providers for signer AdES/QES.
- A real timestamp authority and certificate authority for the seal and for
  B-LT/B-LTA.
- Part 11 mode and the validation pack are a starting point: each
  organization still has to validate its own install.

SignuDoc is software, not legal advice. See the README's legal disclaimer.

[0.4.0]: https://github.com/NYLLON-SOFTWARE/SignuDoc/releases/tag/v0.4.0
[0.3.0]: https://github.com/NYLLON-SOFTWARE/SignuDoc/releases/tag/v0.3.0
[0.2.1]: https://github.com/NYLLON-SOFTWARE/SignuDoc/releases/tag/v0.2.1
[0.2.0]: https://github.com/NYLLON-SOFTWARE/SignuDoc/releases/tag/v0.2.0
[0.1.0]: https://github.com/NYLLON-SOFTWARE/SignuDoc/releases/tag/v0.1.0
