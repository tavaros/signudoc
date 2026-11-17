# Change management policy

**Owner:** `[system owner]`.

1. The install deploys from `[branch]` of `[our repository]`. That branch is protected: changes arrive only by pull request, with `[one]` approval from someone other than the author, and the CI checks passing.
2. **SignuDoc updates** arrive as a pull request from the Update SignuDoc workflow. The reviewer reads the changelog for the releases it brings, notes any security fixes and database changes, checks the Vercel preview, and approves.
3. Security releases are taken within `[7]` days of their release; others within `[30]` days.
4. **Our own changes** to the code follow the same path, and are described in the pull request.
5. **Settings** changed in the app (Settings, Organization) are recorded in the site audit trail. Changes to environment variables in Vercel are approved by `[role]` and recorded in `[location]`, and take effect at the next deployment.
6. **Rollback:** if a deployment misbehaves, `[role]` promotes the previous deployment in Vercel and opens an incident. A release that changed the database is rolled forward with a fix instead, unless the change notes say it can be undone.

**Evidence:** merged pull requests with their approvals and checks, the changelog, Vercel's deployment history.
