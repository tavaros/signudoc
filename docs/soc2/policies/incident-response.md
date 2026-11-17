# Incident response policy

**Owner:** `[security owner]`. **Deputy:** `[name]`.

1. **What counts:** a suspected misused account, a broken audit chain, a failed seal or restore, data sent to the wrong person, an outage, a vendor's incident notice, or a SignuDoc security release that affects us.
2. **Report** to `[channel / address]`. Anyone may report.
3. **Contain**, as fits:
   - a misused account: remove it in the identity provider, or reset its two-step sign-in under People (which signs it out everywhere); change break-glass passwords;
   - a document sent wrongly: void it;
   - a leaked secret: rotate it in Vercel and deploy. `BETTER_AUTH_SECRET` signs everyone out and makes every authenticator unreadable, so rotate it only when it leaked, and clear two-step setups first as [self-hosting](../../self-hosting.md#sign-in-security) describes, or nobody who used two-step sign-in can get back in;
   - a bad deployment: promote the previous one.
4. **Assess** which records and people are affected, using both audit trails and the SIEM.
5. **Notify** affected customers within `[72 hours]` of confirming an incident that affects their data, and regulators where the law requires.
6. **Recover**, from backup if needed ([Backup and restore](../../backup-and-restore.md)).
7. **Close** with a written review: cause, impact, fixes, and follow-up actions with owners.
8. **Test** this plan once a year with a tabletop exercise.

**Evidence:** incident records and reviews, the yearly test.
