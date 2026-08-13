# The native contact form, parked

This form **works**. It was built, tested, deployed, and proven end to end with
a real submission on 13 August 2026: Turnstile verified, the enquiry saved to
Sanity, and the notification email arrived. It is not parked because it is
broken.

It is parked because of where it put the data.

## Why

Submissions were written into this project's Sanity dataset, and that dataset
is **public-read**. The project ID (`8337vjtf`) and dataset name (`production`)
are committed in a public repository, so they cannot be treated as secret.
Together that means every submitted name, email address, phone number, budget
and business description was readable by anyone, with no credentials, from a
single URL.

That is not a theory. `.github/workflows/check-submission-privacy.yml` queried
Sanity with no authentication at all and got a real answer back:

```
HTTP 200
The dataset is PUBLIC-READ. Anyone can read every contact form submission
with no credentials. Count returned: 1
```

The count was 1 because only a test submission had been made. Had this stayed
live, it would have been every real enquirer.

Making a Sanity dataset private requires a paid tier, so there was no free fix
on the storage side, and Sanity's public/private setting is per-dataset — site
content and submissions share one, so submissions cannot be made private while
leaving content public. Tally holds enquiries behind its own authentication for
nothing, which makes it the better choice today despite putting its branding on
the form.

## What is here

| File | Was | Notes |
|---|---|---|
| `contact.astro` | `src/pages/contact.astro` | The five-step form. Renders every fieldset visible in raw HTML; JS turns it into steps at runtime, so it still works with JS off. |
| `functions/contact.ts` | `functions/api/contact.ts` | Honeypot → Turnstile → validation → Sanity → Resend, cheapest check first. |
| `functions/form-progress.ts` | `functions/api/form-progress.ts` | Drop-off counters. No personal data — integers only. |

Still live in `src/lib/`, because they are imported by the tests and harmless
on their own: `budget.ts`, `contactForm.ts`, `contactValidation.ts`,
`formFunnelValidation.ts`. The `submission` and `formFunnel` Studio schemas are
also still in place.

## Still tested, on purpose

Every suite still runs in `build-check.yml` on any change under `parked/`:

```
test-budget.mjs                  the slider's clamp/snap/format arithmetic
test-contact-validation.mjs      one check per server-side rejection path
test-contact-form.mjs            step navigation and the slider, against jsdom
test-contact-function.mjs        the Function as a real Request -> Response
test-form-funnel-validation.mjs  the drop-off allow-list
test-form-progress-function.mjs  the counter endpoint, as a real Request
```

Parked code that stops being tested rots, and is worth nothing by the time you
reach for it. These still pass.

## Bringing it back

The blocker is storage, not the form. Pick one:

**Email only.** Delete the Sanity write from `functions/contact.ts`; the Resend
notification becomes the record. Free, nothing world-readable, no browsable
history in Studio.

**Cloudflare D1 or KV.** Both have free tiers, both are private by default, and
the Function already runs on Cloudflare. Keeps queryable history; needs a
protected page to read it.

**Paid Sanity tier.** Keeps submissions in Studio next to the work they are
about, which was the original appeal. Costs money, and is the only option here
that does.

Then, whichever is chosen:

1. `git mv parked/contact-form/contact.astro src/pages/contact.astro`
2. `git mv parked/contact-form/functions/contact.ts functions/api/contact.ts`
   (and `form-progress.ts` likewise)
3. Fix the `../../../src/lib/...` imports back to `../../src/lib/...`
4. Point the two `entryPoints` in `scripts/test-*-function.mjs` back
5. Restore `/contact` to `STATIC_PATHS` in `src/pages/sitemap.xml.ts`
6. Remove the `/contact` 302 from `public/_redirects`
7. Revert `CONTACT_URL` in `src/lib/contactUrl.ts` and its three call sites
8. Swap `parked/**` back to `functions/**` in `build-check.yml`
9. Restore the `/contact` checks in `scripts/check-live.mjs`

## One thing to do regardless

The single test submission still sits in the public dataset, and it contains a
real phone number. Delete it in Studio → **Contact form submissions**. It stays
readable by anyone for as long as it exists.
