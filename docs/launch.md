# Cutover: moving rumeaudesign.co off Webflow

The order below is the order. Each step is safe to stop at, and every step
before the DNS change is reversible by doing nothing.

## The words, first

Skip this if they are already familiar.

- **DNS** is the phone book of the internet. Someone types
  `rumeaudesign.co`, and DNS is what answers "here is the computer that has
  it". Changing hosts means changing that answer. Nothing about the website
  itself moves.
- **A record** points a name at a numeric address, e.g. `198.202.211.1`.
  **CNAME** points a name at another *name*, e.g. `www` -> `cdn.webflow.com`.
  Same job, two spellings.
- **Apex** (or root) is the bare domain, `rumeaudesign.co`. `www.rumeaudesign.co`
  is a *different* name and needs its own record. They are not automatically
  linked, which is why both appear in every step below.
- **Nameservers** decide who holds the phone book for your domain. Yours are
  Cloudflare's already, so all of this happens in the Cloudflare dashboard -
  no registrar involved, nothing to transfer.
- **MX records** are the same phone book, for email instead of web. Separate
  answer, same domain. This is why a website move can break mail.
- **TTL** is how long the rest of the internet caches an answer before asking
  again. It sets how fast a change - or an undo - actually takes effect.
  Cloudflare's default is a few minutes.
- **Proxied vs DNS-only** ("orange cloud" vs "grey cloud") is whether traffic
  passes through Cloudflare or goes straight to the host. Yours are currently
  DNS-only.

## Is this risky?

Not especially, and it is worth being precise about why.

**Reversible by doing nothing:** everything up to and including publishing to
production. That work lives at `rumeau-design-co.pages.dev` and no visitor to
`rumeaudesign.co` sees any of it.

**Reversible in minutes:** the DNS change itself. Put the old records back and
the old site serves again within a TTL.

**Not reversible:** cancelling Webflow. That is the last step, days later, on
purpose.

**The one genuine hazard** is your email, and only if the DNS records are
hand-edited. The Google Workspace records share the domain with the website
but have nothing to do with it. The runbook avoids the problem by using the
Pages custom-domain flow, which only touches the records it needs.

## What the domain looks like right now

Recorded here because after the change these are what you roll BACK to, and
nobody remembers them under pressure. Checked 12 August 2026:

```
rumeaudesign.co        A       198.202.211.1
www.rumeaudesign.co    CNAME   cdn.webflow.com
MX                     aspmx.l.google.com (1), alt1/alt2 (5), alt3/alt4 (10)
TXT                    google-site-verification=puQTOdlRYFYtQpd2LnGe7kb11apPRtCA7q2Bx3MCrec
TXT                    v=spf1 include:_spf.google.com ~all
NS                     alexa.ns.cloudflare.com, gordon.ns.cloudflare.com
```

**The MX and TXT records are not part of this migration.** They are Google
Workspace: the MX records deliver Chris's email, the SPF record stops his
outgoing mail being marked as spam, and the verification record is what keeps
Google Search Console access. Changing where the website is served has nothing
to do with any of them, and deleting one breaks something that has no obvious
connection to the website - mail that silently stops arriving is the worst
possible launch-day bug because it does not announce itself.

Only two records change: the apex `A` and the `www` `CNAME`.

**Before changing anything, screenshot the DNS tab.** The table above was
reconstructed from outside, by asking DNS what it answers - which is not the
same as reading what Cloudflare has stored. In particular Cloudflare can store
a CNAME at the apex and *answer* with an A record, so the real record may be
`CNAME -> cdn.webflow.com` rather than `A -> 198.202.211.1`. Both resolve
identically, so nothing outside can tell them apart. A screenshot can, and it
takes five seconds. Roll back to what the screenshot says, not to what this
file says.

## 1. Publish to production and check it there first

Actions -> "Deploy to production" -> Run workflow, with **publish ticked**.

This builds with the production settings - visual editing off, preview flag
off - and puts it through `scripts/check-production-build.mjs` before anything
is uploaded. That gate is the reason this step comes first: it is much easier
to find a problem on `rumeau-design-co.pages.dev` than on the domain clients
are looking at.

Then open `https://rumeau-design-co.pages.dev` and check:

- the homepage, portfolio, a case study, the blog, and `/privacy-policy`
- a few redirects, e.g. `/case-studies/dumpstat-podcast` should land on
  `/work/dumpstat`
- view source on any page and confirm there is no `sanity-visual-editing.js`

## 2. Add both hostnames to the Pages project

Cloudflare dashboard -> Workers & Pages -> `rumeau-design-co` -> Custom
domains -> Set up a custom domain. Add **both**:

- `rumeaudesign.co`
- `www.rumeaudesign.co`

Because the domain's nameservers are already Cloudflare's, Cloudflare updates
the DNS records itself. That is the safe path: it changes the two records it
needs and leaves MX and TXT alone. Do not hand-edit the A record instead - the
manual route is where mail records get caught in the crossfire.

Certificates are usually issued within a few minutes. The domain will show
"Verifying" and then "Active".

While you are in the dashboard, check **SSL/TLS -> Overview** for the
`rumeaudesign.co` zone. It should be **Full** or **Full (strict)**. If it says
**Flexible**, change it: Flexible tells Cloudflare to fetch the site over plain
HTTP, and against a host that redirects HTTP to HTTPS - which Pages does - that
produces an endless redirect loop and a site that will not load at all. It is a
one-setting problem with a dramatic symptom, and it is worth ruling out before
the domain is pointed anywhere rather than debugging it live.

## 3. Send www to the apex

Both hostnames now serve the same site, which means every page exists at two
addresses. The canonical tags already tell search engines which one counts, so
this is not urgent, but two live copies of a site is the sort of thing that
quietly splits your search ranking.

Cloudflare dashboard -> the `rumeaudesign.co` zone -> Rules -> Redirect Rules
-> Create rule:

- **If** hostname equals `www.rumeaudesign.co`
- **Then** dynamic redirect to `concat("https://rumeaudesign.co", http.request.uri.path)`
- Status **301**, preserve query string

This cannot go in `public/_redirects`: that file matches on path, not host, so
it has no way to tell the two hostnames apart.

## 4. Check the real domain

- `https://rumeaudesign.co` serves the new site
- `https://www.rumeaudesign.co` redirects to it
- the redirects from step 1 still work on the real domain
- `https://rumeaudesign.co/sitemap-index.xml` loads
- **send yourself an email**, from outside, and confirm it arrives

That last one is not paranoia. It is the check that costs ten seconds and
catches the failure that otherwise surfaces days later as "why has nobody
replied to me".

## Do NOT set up redirects in Webflow

Once DNS moves, Webflow never sees a single request. Traffic goes to
Cloudflare, Cloudflare serves this site, and Webflow is simply not in the path
any more - so a redirect configured there could never fire. Redirects for this
site live in `public/_redirects`, they are already written, and they ship with
the build.

**But do read Webflow's redirect list before cancelling.** Site settings ->
Publishing -> 301 redirects. Anything in there is a record of an old URL that
mattered enough for someone to redirect it once - possibly from a version of
the site that predates the sitemap `public/_redirects` was built from. Those
rules are about to stop existing.

Copy any that still point somewhere real into `public/_redirects` in the same
format, one per line:

```
/old-path    /new-path    301
```

If the list is empty, nothing to do. If it is not, that list is the only place
those old URLs are written down, and cancelling the subscription deletes it.

## 5. Only now, Webflow

Leave the Webflow subscription running until the new site has been live on the
real domain for a few days. It costs one more month at most, and it is the
rollback: if something is badly wrong, point `www` back at `cdn.webflow.com`
and the apex back at `198.202.211.1`, and the old site is serving again within
a DNS TTL.

Cancel once you are confident, not once it is live.

## 6. Afterwards

- **Google Search Console**: submit `https://rumeaudesign.co/sitemap-index.xml`.
  The verification TXT record is untouched, so access carries over.
- **Meta Events Manager**: re-run a test event against the real domain. The
  pixel does not load on preview builds by design, so this is the first time it
  will actually fire.
- **Sanity publish webhook**: see `docs/sanity-publish-webhook.md`. Note it
  rebuilds the PREVIEW site, not production - production stays manual, which is
  deliberate.

## Known gaps at launch

- **No cookie consent banner.** The Meta pixel fires on page load. For visitors
  in the EU or UK that is not compliant without prior consent. Fine while the
  audience is US; a real gap if that changes. See `src/components/MetaPixel.astro`.
- **The homepage hero is a 3,981 KB animated WebP**, about 88% of that page's
  weight, and it ships whole to every phone because re-encoding would kill the
  animation.
- **No default share image.** Pages without one of their own share as the
  wordmark padded onto white. One image in Site Settings fixes every such page.
