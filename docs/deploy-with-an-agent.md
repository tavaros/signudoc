# Deploying SignuDoc with an agent

This page is for an AI agent that controls a web browser and has been asked to deploy SignuDoc for someone. It lists every step, what to choose, what to ask the person, and how to retry when a step fails. A person can follow it too. The [self-hosting guide](self-hosting.md) explains each step in more depth.

The person you are working for is called "the person" below.

## Before you start

- The browser should already be signed in to the person's **Vercel** account and to the **GitHub** account Vercel will copy SignuDoc into. If a sign-in page appears, stop and ask the person to sign in. Never type a password, a one-time code or a passkey prompt for them unless they give you that job.
- **Which Vercel plan.** Vercel's free Hobby plan is only for [personal, non-commercial use](https://vercel.com/docs/limits/fair-use-guidelines). Before you start, ask the person whether SignuDoc is for a company or other organization's work, or only for their own personal use.
  - **Personal, non-commercial use:** the Hobby plan is fine.
  - **An organization's work:** the Vercel account or team you deploy into belongs on **Vercel Pro**, $20 a month at the time of writing (see [What it costs](self-hosting.md#what-it-costs)). If it is not on Pro yet, tell the person and let them upgrade or approve the upgrade themselves. Never pay or upgrade without their say-so. If they decline, stop.
- Neon, Resend and Vercel Blob: pick the **free plan** for each, whichever Vercel plan the person uses. If any other screen asks for a card, a paid plan or an upgrade, stop and ask the person.
- Ask the person for these before you begin, so you are not stopped half way:
  1. **Whether this is for an organization's work or for personal use**, to pick the Vercel plan (above).
  2. **The domain email should come from**, for example `acme.com`. SignuDoc suggests a `sign.` subdomain (`sign.acme.com`) so its email stays apart from the organization's own. If they have no domain yet, email can wait: leave Resend's domain question at its default.
  3. **The organization's name**, as signers should see it.
  4. **The support email address** signers and staff should write to for help.
  5. **The administrator's name and email address.** The person creates the password themselves at step 6, or tells you to use their password manager.
  6. **Whether they want to try email before their domain is verified.** If so, leave the sender address empty at step 6 (see step 7).
- Do one step at a time, and check each result on the page before you move on. Vercel changes its wording from time to time, so match screens by what they do, not by exact text.

## 1. Open the Deploy button

Open this address (it is the "Deploy to Vercel" button in the [README](../README.md)):

```
https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FNYLLON-SOFTWARE%2FSignuDoc&project-name=signudoc&repository-name=signudoc&stores=%5B%7B%22type%22%3A%22integration%22%2C%22integrationSlug%22%3A%22resend%22%2C%22productSlug%22%3A%22resend-email%22%2C%22protocol%22%3A%22messaging%22%7D%2C%7B%22type%22%3A%22integration%22%2C%22integrationSlug%22%3A%22neon%22%2C%22productSlug%22%3A%22neon%22%2C%22protocol%22%3A%22storage%22%7D%2C%7B%22type%22%3A%22blob%22%2C%22access%22%3A%22private%22%7D%5D
```

## 2. Create the copy on GitHub

Vercel asks where to put the copy of SignuDoc. Choose the person's GitHub account (or the organization they name), keep the name `signudoc` unless it is taken, and create it. A private repository is fine. If Vercel asks to install or authorize its GitHub app, that is expected; if GitHub asks the person to confirm with a passkey or code, hand over to them.

## 3. Add the three stores, in the order shown

Vercel lists three things to add. Add each one, on its free plan:

1. **Resend** (email). When it asks for a domain, enter the sending domain the person gave you, such as `sign.acme.com`. Accept its terms if asked. Resend then sets the domain up and checks its DNS records in the background; you do not need to wait for that here.
2. **Neon** (Postgres database). Pick the region closest to the person, or the one they name. If they will sign agreements in the EU, choose an EU region.
3. **Vercel Blob** (file store). It is already set to **private**. Leave it private.

Resend is first on purpose: it needs the most time to be ready, and adding it first gives it the time the other two take.

## 4. Deploy, and retry if Vercel cannot provision a store

Click **Deploy** and wait for the result. It usually takes two to four minutes.

- **Success.** Vercel shows the new site with a link to visit it. Go to step 5.
- **"One or more integration resources failed to provision for this deployment."** The deployment stopped before it built, almost always because Resend was still checking its domain. Nothing needs fixing. Then:
  1. Wait 60 to 120 seconds.
  2. Refresh the page. Open the project's **Storage** tab and check that Resend, Neon and Blob are all listed.
  3. Open **Deployments**, open the menu (⋯) on the failed deployment, click **Redeploy**, and confirm.
  4. If it fails the same way, wait three to five minutes and redeploy again. After three failed tries, stop and tell the person what you saw, including the message and the time.
- **The build fails with a log.** This is a different problem. Do not redeploy in a loop. Copy the last 30 or so lines of the build log and give them to the person.

## 5. Open the new site

Open the production address (`https://<project>.vercel.app`, or the "Visit" link). Do this straight away: a new install belongs to whoever opens it first.

- **It opens on `/setup`.** Go to step 6.
- **It says to connect a database.** Neon was not connected when the site was built. In the project, open **Storage**, connect the Neon database to the project for Production, then redeploy (step 4.3) and reload the site.

## 6. Set the site up

On the setup page:

1. Enter the **organization's name** and the **support email address**.
2. **Send email from** is filled in from what the site knows, usually `notifications@sign.<their domain>`. Check it against the domain the person gave you, and correct it if needed. If the person wants to try email before the domain is verified, clear it instead; it can be set later under Settings, Organization.
3. Enter the **administrator's name** and **email**. Let the person type the password, or use their password manager if they told you to. Never make one up and keep it.
4. Finish setup. You are signed in as the administrator.

## 7. Check email

Open **Settings, Organization** and find the email section.

- **"Email is not connected".** The Resend keys reached the project after this deployment was built. Redeploy once (step 4.3) and reload.
- **DNS records listed, not yet verified.** The domain's records are not in place yet. If the domain is managed somewhere other than Vercel, give the person the list of records to add where their domain is managed. The page checks them again by itself. This can take from minutes to a few hours.
- **Verified.** Email is ready.

Once a sender address is saved, every email goes out from it, and Resend refuses to send from it until its domain is verified, even to the person's own address. To try SignuDoc before that, the sender address must be empty: mail then goes out from Resend's test address, which delivers only to the email address of the Resend account, so the person can send a document to themselves.

## 8. Report back

Tell the person:

- the site's address and the GitHub repository it deploys from,
- whether email is verified, and any DNS records they still have to add,
- anything you could not do, and why.

Then point them to the [self-hosting guide](self-hosting.md) for their own web address, `SETUP_TOKEN`, the "Needs Attention" badge on database variables, and keeping the install up to date.

## Rules for the agent

- Never pay for, upgrade or start a trial of anything without the person's say-so.
- Never delete a project, store, database or repository to "start over". If something is badly wrong, stop and ask.
- Never copy a secret (API keys, database URLs, passwords) out of Vercel into a chat, a file or a message.
- Redeploy only for the provisioning message in step 4 and for the cases in steps 5 and 7, and no more than three times in a row.
