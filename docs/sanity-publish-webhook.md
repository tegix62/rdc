# Auto-rebuild the preview when you publish in Sanity

**What this fixes:** the site is fully static. Editing content in Studio and
clicking Publish changes nothing on `preview.rumeau-design-co.pages.dev` until
something rebuilds it. Right now that "something" is a person - Chris asking,
or Claude dispatching the workflow by hand. This wires it up so a publish in
Studio triggers the rebuild itself, usually live within a couple of minutes.

Two things need setting up, both outside this repo, and only Chris can do
either - they need his GitHub account and his Sanity project.

---

## ✅ SAFE TO SET UP AS OF 12 AUGUST 2026

`repository_dispatch` always runs the workflow on the repository's **default
branch**. There is no way to point it at another one: the event carries no ref,
and GitHub picks `main` regardless of where the workflow file also exists.

That used to be the blocker. `main` was 203 commits behind the work branch, so
turning this on would have meant: publish in Studio → GitHub rebuilds `main` →
the preview is replaced by a months-old build. Every publish would have appeared
to destroy the site.

The work branch has since been merged, so `main` now carries everything.
Re-check before enabling if any time has passed:

```
git fetch origin main
git rev-list --count origin/main..origin/claude/webflow-astro-sanity-port-ig55e2
```

`0` means `main` has everything and this is safe to turn on. Anything else means
wait.

To rebuild the preview by hand in the meantime:
https://github.com/tegix62/rdc/actions/workflows/deploy-pages.yml → "Run
workflow" → Run. `main` is now the right choice, where it previously was not.

---

## 1. A GitHub token Sanity can use to trigger the workflow

**It must be a CLASSIC token. A fine-grained token cannot do this.**

That is the opposite of the usual advice, and it cost an hour to establish, so
here is the evidence rather than the assertion. A fine-grained token with
`tegix62/rdc` explicitly selected and `Contents: Read and write` granted - which
is what GitHub's own docs list for this endpoint - returns:

```
403  {"message": "Resource not accessible by personal access token",
      "documentation_url": ".../repos#create-a-repository-dispatch-event"}
```

Every time, on `POST /repos/{owner}/{repo}/dispatches`. Adding permissions does
not help because there is nothing left to add. The endpoint simply does not
accept fine-grained tokens.

An earlier version of this file said to use a fine-grained token with
**Actions: Read and write**, which is wrong twice over: wrong token type, and
Actions is not the permission GitHub documents for it either.

### The steps

1. GitHub → Settings → Developer settings → Personal access tokens →
   **Tokens (classic)** → Generate new token (classic).
2. **Note:** `sanity-publish-deploy`.
3. **Expiration:** 1 year. Not 90 days: when this token lapses, publishing in
   Studio silently stops deploying, which is the exact failure this whole
   document exists to remove. Put the renewal in a calendar.
4. **Scopes:** tick **`public_repo`** and nothing else.

   `public_repo` is a checkbox nested *underneath* `repo`. Tick the child. The
   parent `repo` scope would add write access to every private repository on the
   account, which this does not need.

   This works because `rdc` is public. If it is ever made private, `public_repo`
   stops being enough and the only classic option is full `repo`.
5. Generate it and copy the token. It's shown once.

**Blast radius, stated plainly:** classic tokens are account-wide, so
`public_repo` means write access to all public repos on the account rather than
just this one. That is worse than the fine-grained equivalent and is forced by
the endpoint, not chosen. It is the narrowest scope that works.

## 2. A webhook in Sanity that fires on publish

1. [manage.sanity.io](https://manage.sanity.io) → the `8337vjtf` project →
   **API** → **Webhooks** → Create webhook.
2. **Name:** `Trigger preview rebuild`.
3. **Dataset:** `production`.
4. **URL:** `https://api.github.com/repos/tegix62/rdc/dispatches`
5. **Trigger on:** Create, Update, Delete (leave all three checked - a
   deleted document should rebuild the site too).
6. **HTTP method:** POST.
7. **HTTP Headers** - add two:
   - `Authorization` → `Bearer <the token from step 1>`
   - `Accept` → `application/vnd.github+json`
8. **Projection** - the field labelled "Customize payloads with GROQ
   projections", further UP the form, above Advanced settings. NOT an HTTP
   header, which is an easy mistake to make because the headers table is right
   next to where you have just been typing. Set it to exactly:
   ```
   {"event_type": "sanity-publish"}
   ```
   A fixed object, not a projection of the document. GitHub reads `event_type`
   from the request body and rejects anything else in it, so there is nothing
   from the changed document worth sending.

   Leave **Filter** empty. The Drafts and Versions checkboxes below already
   exclude the noisy cases, and a filter here would only narrow what triggers a
   deploy.

9. **Drafts:** leave unchecked. **Versions:** leave unchecked. Otherwise every
   keystroke in a draft fires a production deploy - Sanity's own warning on that
   field says as much.

10. **Secret:** leave empty. It is for Sanity to sign requests so a receiver can
    verify they came from Sanity; GitHub ignores it. It looks like the field a
    credential belongs in, and it is not.
9. Save it. Sanity will fire a test request; a `204` back from GitHub means
   it worked. `401` means the token or header is wrong; `404` means the repo
   or URL is typed wrong.

## What happens after that

Any publish in Studio → Sanity POSTs to GitHub → the `Deploy to Cloudflare
Pages` workflow runs (see its `repository_dispatch` trigger) → new build with
the fresh content → live on the stable preview URL, same as any other deploy.

## What this does NOT touch

This wires up the **preview** only (`deploy-pages.yml`). The **production**
workflow (`deploy-production.yml`) stays manual on purpose - it has a
`publish` flag that defaults to `false` and a pre-deploy gate, specifically so
nothing reaches the real domain without someone deciding that on purpose. Once
the domain is cut over, an auto-deploying production pipeline is a much bigger
decision than this one and shouldn't inherit this webhook without a separate
conversation.
