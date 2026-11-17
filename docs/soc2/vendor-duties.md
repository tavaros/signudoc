# Vendor duties

A SignuDoc install on Vercel runs on the services below. For your SOC 2 audit they are subservice organizations: your auditor usually carves them out, which means you collect each one's SOC 2 report, check its opinion and exceptions, and show that you do the complementary user entity controls (CUECs) the report says customers must do.

What each vendor offers, and which plan includes its report, was checked on 2026-11-16. It changes; check again before an audit.

## Required services

### Vercel (hosting, functions, Blob storage, cron, logs)

- **Holds:** the running app, build and runtime logs, every PDF in the Blob store (originals, sealed copies, certificates), and the backup store if you keep it on Vercel.
- **Report:** SOC 2 Type 2 (Security, Confidentiality, Availability). Available to Pro and Enterprise teams under Team Settings, Compliance, or through security.vercel.com. Not available to Hobby teams.
- **Shared responsibility:** Vercel's model is at https://vercel.com/docs/security/shared-responsibility. Read it with the CUEC section of the report.
- **CUECs you will typically need to show:**
  - Team membership limited to the people who run the install, each with MFA, reviewed regularly. Single sign-on to the Vercel team itself is a paid Vercel add-on on Pro; without it, require MFA on each member's Vercel account.
  - Environment variables that hold secrets marked Sensitive.
  - Deployment protection on preview deployments, so previews of unmerged changes are not public.
  - A log drain, if your monitoring relies on logs: runtime logs on their own are kept for a short time (about a day on Pro).
  - Team audit logs (who changed what in the Vercel team) are an Enterprise feature. On Pro, record team changes yourself.

### Neon (Postgres, through the Vercel Marketplace)

- **Holds:** every account, document record, setting and both audit trails.
- **Report:** SOC 2 Type 2, through trust.neon.com. Neon's pricing page lists SOC 2 among the features of its Scale plan; check which plan your report access and the controls you need come with.
- **CUECs you will typically need to show:**
  - Console and project access limited and reviewed. Someone with full database access can change rows, including rewriting an audit chain consistently, so this matters more than usual.
  - A restore window that meets your recovery point objective (short on the free plan, longer on paid plans), and SignuDoc's own daily backup on top.
  - The region chosen for your data residency needs.

### Resend (email, through the Vercel Marketplace)

- **Holds:** delivery logs of every email (invitations, codes, reminders, completion notices) and their content for a time.
- **Report:** SOC 2 Type II (period 2025-02-01 to 2026-02-01 when checked), under Settings, Documents in the Resend dashboard. The site does not say which plans include it; ask Resend if yours does not show it.
- **CUECs you will typically need to show:**
  - Your own verified sending domain, with SPF and DKIM.
  - Account access limited and reviewed. Single sign-on to Resend is a paid add-on.
  - Email treated as a notification, not the record. The record is in the database and the sealed PDFs.

## Optional services

Only if you turn them on. Each is outside Vercel and set up by you.

| Service                                         | When                                    | What to collect                                                                                        |
| ----------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Your identity provider (Okta, Entra ID, Google) | Single sign-on (`SSO_ISSUER`)           | You already have it in scope. Note that removing someone there removes their access here.              |
| A SIEM or log service                           | A Vercel log drain                      | Its report, and the retention you set.                                                                 |
| eID Easy, or a trust service provider (CSC API) | Signatures in the signers' own names    | Their eIDAS qualification (the EU trusted list) and security report, if signed records depend on them. |
| A certificate authority and timestamp server    | `SEAL_P12_BASE64`, `SEAL_TIMESTAMP_URL` | Their certificate policy and, for a qualified seal, their place on the EU trusted list.                |
| A second Vercel team for backups                | `BACKUP_BLOB_READ_WRITE_TOKEN`          | Covered by Vercel's report. Record who has access to that team; keep it smaller than the main team.    |

## The SignuDoc project

SignuDoc is open-source software, provided as is under its license, with no supplier agreement, support commitment or SOC 2 report of its own. It never receives your data: there is no SignuDoc service between your install and your vendors. For your audit, treat it like any other open-source component you build from:

- You choose when to take a release, and review it (the update workflow opens a pull request with the changelog).
- Each release from v0.3.0 has an SBOM and signed build provenance you can verify ([SECURITY.md](../../SECURITY.md#verifying-a-release)).
- The repository's own checks (CodeQL, dependency review, `npm audit`, OpenSSF Scorecard) are described in [SECURITY.md](../../SECURITY.md#how-the-code-is-checked).

## Vendor review record

Once a year, and when you add a vendor, record for each:

- Vendor, service and plan: `[ ]`
- Data held, and its region: `[ ]`
- Report reviewed (type, period, opinion), and exceptions noted: `[ ]`
- CUECs from the report, and how you meet each: `[ ]`
- Contract and data processing terms in place: `[ ]`
- Who in your organization has access: `[ ]`
- Reviewed by `[name, role, date]`. Next review: `[date]`
