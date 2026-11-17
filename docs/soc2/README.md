# SOC 2 pack

SOC 2 is an audit of an **organization**, not of software. Nobody can certify SignuDoc as "SOC 2 compliant", because SignuDoc is code that each organization deploys and runs for itself. What an auditor looks at is your organization: how you run the install, who can reach it, how you change it, and which vendors you rely on.

This folder is there to make that easy. It is for the person at a deploying organization who has to put a SignuDoc install into their SOC 2 scope, or answer a customer's security questionnaire about it.

| File                                      | What it is for                                                                                                                      |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| [Control map](control-map.md)             | The SOC 2 Trust Services Criteria, and for each one what the app does, what the vendors do, and what is yours to do.                |
| [Vendor duties](vendor-duties.md)         | The services an install runs on, what each holds, which reports to collect, and the complementary controls their reports expect.    |
| [Questionnaire answers](questionnaire.md) | Answers to the questions security questionnaires ask most, for an install set up as this pack recommends. Edit them to match yours. |
| [Sample policies](policies/)              | Short starting points for the policies an auditor asks to see, written for a SignuDoc install. Adopt them into your own policy set. |
| [Setup checklist](#setup-checklist)       | The settings that make the answers above true.                                                                                      |

The pack describes SignuDoc as of the release it ships with. Check it against the version you run, and against your vendors' current reports: what they offer changes, and so does what your plan includes.

## Who does what

- **SignuDoc (the code)** gives you the controls inside the app: sign-in security, roles, audit trails, sealed documents, retention, backups. It is open source and provided as is, with no supplier agreement. You review and accept each release.
- **Your vendors** (Vercel, Neon, Resend, and any optional ones) run the infrastructure. Each has its own SOC 2 report, and your auditor treats them as subservice organizations, usually by the carve-out method: you collect their reports and show you meet the complementary user entity controls they list.
- **Your organization** owns everything else: who gets access, how changes are approved, monitoring, incident response, vendor review, policies, and training.

## Setup checklist

Turn these on before an audit period starts. Each links to how.

- [ ] Vercel team on a plan that includes the SOC 2 report and the controls you need (see [Vendor duties](vendor-duties.md)). Team members limited to the people who run the install, each with their own login and MFA.
- [ ] Neon project on a plan whose restore window meets your recovery objective. Console access limited the same way.
- [ ] `CRON_SECRET` set, so only Vercel's cron can start the daily jobs ([self-hosting](../self-hosting.md#daily-cleanup)).
- [ ] `SETUP_TOKEN` set before the install's URL is public, or setup finished at once ([self-hosting](../self-hosting.md#lock-down-a-new-install)).
- [ ] Single sign-on through your identity provider, with `PASSWORD_SIGN_IN=off` and one or two break-glass addresses ([self-hosting](../self-hosting.md#single-sign-on)). Or, without SSO, two-step sign-in required for everyone (Settings, Organization, Sign-in security).
- [ ] Session limits set: for example 30 minutes without use and 12 hours at most (Settings, Organization, Sign-in security).
- [ ] Sign-up limited to your own email domains, or closed (Settings, Organization).
- [ ] A Vercel log drain to your SIEM, with alerts on `sign_in_locked`, `role_changed`, `two_factor_requirement_changed`, `settings_changed`, `backup_failure` and `retention_job_failure` ([self-hosting](../self-hosting.md#send-the-audit-trail-to-your-siem)).
- [ ] The daily backup to a second Blob store in another Vercel team, and a test restore on the calendar ([Backup and restore](../backup-and-restore.md)).
- [ ] Retention rules that match your records policy (Settings, Organization).
- [ ] The GitHub repository that deploys the install (your copy) with branch protection on the production branch, and updates taken through pull requests ([self-hosting](../self-hosting.md#keep-your-install-up-to-date)).
- [ ] A support address that reaches a monitored mailbox (Settings, Organization).
