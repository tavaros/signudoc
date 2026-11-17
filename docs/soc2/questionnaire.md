# Questionnaire answers

Answers to the questions customer security questionnaires (SIG Lite, CAIQ, and the ones companies write themselves) ask most often, for a SignuDoc install set up as the [setup checklist](README.md#setup-checklist) describes. Replace each `[bracket]` with your own facts, and change any answer that is not true of your install. An answer you cannot back with evidence is worse than "no".

## Company and scope

**Do you have a SOC 2 report?**
`[Our organization's SOC 2 Type 2 report covers the e-signature service.]` Or, if not: the service runs on Vercel, Neon and Resend, each of which has its own SOC 2 Type 2 report, available under NDA. We run SignuDoc, an open-source e-signature application, on our own accounts with those vendors; no other company handles your documents.

**Who hosts the service, and where is data stored?**
Vercel (application and file storage) in `[region]`, Neon (Postgres database) in `[region]`, and Resend (email) in `[region]`. All three are under contract with `[us]`.

**Do you use subprocessors?**
Yes: Vercel, Neon and Resend `[and any optional ones: identity provider, SIEM, signing provider]`. See [vendor duties](vendor-duties.md).

## Access control

**Do you support single sign-on?**
Yes, OpenID Connect with any compliant identity provider, including Okta, Microsoft Entra ID and Google Workspace. `[Password sign-in is turned off; only two named administrators keep a password for emergency access.]` SAML is not supported.

**Do you support multi-factor authentication?**
Yes. With single sign-on, your identity provider's MFA applies. For password sign-in, two-step sign-in with an authenticator app (TOTP) and single-use backup codes, which `[is required for every account]`.

**What are your password rules?**
At least 15 characters, at most 128, checked against the Have I Been Pwned breach list (k-anonymity: only a hash prefix leaves the server). Hashed with scrypt. Ten wrong passwords for one address within 15 minutes lock that address for 15 minutes.

**How do you limit sessions?**
Sessions end after `[30 minutes]` without use and at most `[12 hours]` after sign-in. A user can sign out every device at once. Ending a session takes effect on the next request.

**How is access granted and removed?**
Accounts are limited to `[our email domains]`. With single sign-on, access follows assignment in our identity provider: removing someone there stops their sign-in. Administrator rights are granted by another administrator and recorded in the audit trail. Access is reviewed `[quarterly]`.

**Is customer data separated between customers?**
`[This install serves only our organization.]` Within it, each sender sees only their own documents, and each signer reaches only the document they were sent, through a random single-use link.

## Data protection

**Is data encrypted in transit?**
Yes. HTTPS only, with HSTS. Database connections require TLS.

**Is data encrypted at rest?**
Yes, by the storage providers: Vercel Blob and Neon encrypt stored data. Authenticator secrets and backup codes are also encrypted by the application.

**Can documents be tampered with after signing?**
Each finished document is sealed with a PAdES signature `[from our own certificate / from a certificate authority, with a trusted timestamp and long-term validation]`, so any change shows in Adobe Acrobat and other PDF readers. A certificate of completion lists each signer, time, IP address and identity check.

**How long do you keep data, and how is it deleted?**
Finished documents are deleted `[N days]` after completion `[or: kept until deleted by hand]`, by a daily job. Closed accounts are deleted after a 30-day export window. Backups keep copies of deleted files for `[30]` more days.

## Logging and monitoring

**Do you keep audit logs?**
Yes. Each document has its own audit trail (created, sent, viewed, consented, identity checks, signed, declined, voided, completed). The install has another for sign-ins and failed sign-ins (with IP address and reason), lockouts, sign-outs, password and two-step changes, role and settings changes, and account closures. Both are hash chains, so a changed or removed entry shows, and both export as CSV.

**Are logs sent to a SIEM?**
`[Yes: every audit entry and security event is sent as structured JSON to our SIEM through a Vercel log drain, where we alert on lockouts, role changes and settings changes.]`

**How long are logs kept?**
The audit trails in the database are kept with the records they describe. `[Our SIEM keeps the copies for N days.]`

## Operations

**How are changes deployed?**
Through pull requests to our copy of the code, reviewed by `[a second person]` before merging. Each change gets a preview deployment first. Every deployment is kept and can be rolled back. Database changes are versioned migrations applied by the production build.

**How do you handle vulnerabilities?**
We take each SignuDoc release `[within N days, and security fixes within N days]`. The SignuDoc repository runs CodeQL, dependency review and `npm audit`, and each release has an SBOM and signed build provenance. `[We run our own penetration test yearly.]`

**Do you have backups, and do you test them?**
Yes. Neon keeps point-in-time history for `[N days]`. A daily backup copies the database and every file to a separate storage account `[in another Vercel team]`, kept `[30]` days. We test a full restore `[yearly]`, most recently on `[date]`.

**What are your RPO and RTO?**
`[RPO 24 hours from the daily backup, or less from Neon's point-in-time restore. RTO N hours.]`

**Do you have an incident response plan?**
`[Yes, tested yearly.]` See our [incident response policy](policies/incident-response.md). We notify affected customers within `[72 hours]` of confirming an incident that affects their data.

**What is your uptime?**
`[As measured by our monitoring.]` The service depends on Vercel and Neon; see their status pages and SLAs `[on our plans]`.
