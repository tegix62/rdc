# Setting up the native contact form

Replaces the Tally form. Every piece of code is built and tested; what is left
is account-level setup in Cloudflare and Resend that only Chris can do - none
of it is something an API token in this session can create.

Enquiries are stored in **Cloudflare D1**, not Sanity - see step 3 for why.
Sanity remains the CMS for every page, post and case study; nothing about
editing the website changes.

**Nothing breaks in the meantime.** Until this is done, `/contact` renders
with a note where the spam check should be ("Spam check not configured"), and
every real submission is rejected with a clear message pointing at
chris@rumeaudesign.co. The site does not silently lose enquiries; it visibly
refuses them until this is finished.

## 1. A Turnstile widget

Cloudflare dashboard -> **Turnstile** -> Add a site.

- **Widget mode:** Managed (the default) is right - it only shows a visible
  challenge to a request Cloudflare is unsure about, invisible otherwise.
- **Domains:** add `rumeaudesign.co` **and** the preview host
  (`rumeau-design-co.pages.dev`). Leaving the preview host off means the
  widget silently refuses to render there, and the preview form becomes
  untestable for a reason that looks nothing like "add the domain".

This produces two keys:

- **Site key** - public, meant to be visible in the page source. Goes in
  step 2.
- **Secret key** - goes in step 4, and nowhere else. Never commit it.

## 2. The site key as a GitHub Actions repo VARIABLE (not a secret)

Repo -> Settings -> Secrets and variables -> Actions -> **Variables** tab
(not Secrets) -> New repository variable:

- **Name:** `TURNSTILE_SITE_KEY`
- **Value:** the site key from step 1

The Variables tab, specifically. It is a genuinely public value - Turnstile's
own design ships it in HTML - so storing it as a secret would just make it
harder to see and imply a sensitivity it does not have.

This is read at BUILD time (`.github/workflows/deploy-production.yml` and
`deploy-pages.yml`), which is why it belongs in GitHub Actions rather than
Cloudflare - the site is a static build, and this value has to be baked into
the HTML before it ever reaches Cloudflare.

## 3. A D1 database for the enquiries

Enquiries are stored in Cloudflare D1, **not** in Sanity. Sanity stays the CMS
for every page, post and case study - nothing about editing the website
changes. Only enquiry records live elsewhere.

### Why not Sanity

The Sanity dataset is public-read: the project ID (`8337vjtf`) and dataset name
(`production`) are committed in a public repository, so anything stored there
is readable by anyone with no credentials. That is fine for website content,
which is public anyway, and completely wrong for names, emails, phone numbers
and budgets. Private datasets are a paid Sanity tier and the setting is
per-dataset, so there was no way to keep content public and enquiries private
in one dataset.

D1 has no public read path at all. A row is reachable only through a Function
with the database bound to it, or through your own Cloudflare login. It is free
for this: 5 GB of storage and 100,000 row-writes per day, against a form that
might see a handful a week.

### Create it

In the Cloudflare dashboard: **Storage & Databases** -> **D1** -> **Create
database**.

- **Name:** `rdc-enquiries`

Then create the table. From a terminal in this repo:

```
npx wrangler d1 execute rdc-enquiries --remote --file=parked/contact-form/schema.sql
```

`--remote` matters. Without it wrangler writes to a local SQLite file on your
own machine and reports success, and the deployed Function then fails with
"no such table" against a database that looks correct in the dashboard.

### Bind it to the Pages project

**Workers & Pages** -> `rumeau-design-co` -> **Settings** -> **Bindings** ->
**Add** -> **D1 database**.

- **Variable name:** `DB` - exactly this, in capitals. The Function reads
  `env.DB`; any other name and it will not find the database.
- **D1 database:** `rdc-enquiries`

Add it to **Production**. Add it to Preview too if you want the preview
deployment's form to work.

Like environment variables, a binding only applies to deployments made *after*
it is added - see the note at the end of step 5.

## 4. A Resend account and API key

[resend.com](https://resend.com) -> sign up.

**Sign up with chris@rumeaudesign.co specifically, not any other address.**
Resend's shared sending address (`onboarding@resend.dev`), which
`functions/api/contact.ts` uses so that sending a notification touches no DNS
record on this domain, can only deliver **to the email address that owns the
Resend account** until a custom domain is verified. If the account is
created with a different address, notifications will silently go nowhere -
Resend accepts the send and the Function reports success, because from its
side nothing failed.

*(This is Resend's documented behaviour as of when this was written, not
something tested against a live account from here - this sandbox cannot
reach their API. Send yourself one test enquiry after setup and confirm it
actually arrives before trusting the form is done.)*

Dashboard -> **API Keys** -> Create API key -> Sending access is enough,
full access is not needed.

## 5. Three environment variables in Cloudflare Pages

Cloudflare dashboard -> Workers & Pages -> `rumeau-design-co` -> Settings ->
**Environment variables**.

Add all three, and add them to **both** Production and Preview environments -
the preview site needs a working form too, for testing:

| Variable | Value | Encrypt? |
|---|---|---|
| `TURNSTILE_SECRET_KEY` | the secret key from step 1 - **check it is 35 characters** | Yes |
| `RESEND_API_KEY` | the key from step 4 | Yes |
| `CONTACT_NOTIFY_EMAIL` | `chris@rumeaudesign.co` | No, but fine either way |

Three, not four: the database is a **binding** from step 3, not a variable,
and lives under Bindings rather than Environment variables.

### Count the characters in the secret key before saving it

Turnstile's site key and secret key sit next to each other on the same page,
both begin with the same characters (`0x4AAAAAAA…` for a real pair), and look
identical at a glance. The only reliable difference is length:

- **site key: 24 characters** - the public one, goes in the GitHub *variable* at step 2
- **secret key: 35 characters** - the private one, goes here

Pasting the site key into `TURNSTILE_SECRET_KEY` produces
`invalid-input-secret` from Cloudflare, which reads as *"this key is wrong"*
rather than *"this is the wrong kind of key"*. That misdirection cost an
afternoon of setup: the key being pasted was correct every time, it was
simply the wrong one of the two. Re-copying it cannot fix it, and neither can
redeploying.

If /contact ever rejects a submission you know is genuine, its error message
prints the stored secret's character count. 24 means this mistake; the
message says so outright.

**Environment variables apply to deployments made AFTER they are set** - an
already-live deployment does not retroactively pick them up. A fresh deploy
is needed once these are in place; see step 7.

## 6. Restore the form to the site

The page and its Functions are currently parked in `parked/contact-form/` so
that nothing collects enquiries while the storage question was open. Tell me
once steps 1-5 are done and I will move them back and open the pull request -
it is a file move plus a handful of one-line reversions, all listed in
`parked/contact-form/README.md`.

Deliberately last. Everything above can be set up while the live site keeps
pointing at Tally, so a half-finished setup never reaches a visitor.

## 7. Deploy the site

Actions -> **Deploy to production** -> Run workflow, publish ticked. This is
the deploy that both bakes in the Turnstile site key from step 2 (build-time)
and picks up the Cloudflare env vars and D1 binding from steps 3 and 5
(request-time, so
technically effective as soon as they are saved - but confirming with a fresh
deploy removes any doubt about which build is being tested).

## 8. Send yourself a real enquiry

Fill in `/contact` end to end, submit it, and check three places:

- **The database** - Cloudflare dashboard -> D1 -> `rdc-enquiries` ->
  **Console**, then run `SELECT * FROM enquiries ORDER BY id DESC LIMIT 5;`
  The row should be there within seconds. (A proper admin page at
  `/admin/enquiries` is the next thing to build; until then the dashboard
  console is how you read history. The notification email is the day-to-day
  interface.)
- **Your inbox** (chris@rumeaudesign.co) - the notification email. If this
  is missing but the row exists, the submission still worked; only the email
  step failed, most likely because of the Resend account-email requirement in
  step 4.
- **The confirmation page** - "Thanks for filling this out!"

If any of the three is missing, that narrows exactly which step above needs
a second look.
