# Auto-rebuild the preview when you publish in Sanity

**What this fixes:** the site is fully static. Editing content in Studio and
clicking Publish changes nothing on `preview.rumeau-design-co.pages.dev` until
something rebuilds it. Right now that "something" is a person - Chris asking,
or Claude dispatching the workflow by hand. This wires it up so a publish in
Studio triggers the rebuild itself, usually live within a couple of minutes.

Two things need setting up, both outside this repo, and only Chris can do
either - they need his GitHub account and his Sanity project.

## 1. A GitHub token Sanity can use to trigger the workflow

1. GitHub → Settings → Developer settings → **Personal access tokens →
   Fine-grained tokens** → Generate new token.
2. **Repository access:** "Only select repositories" → `tegix62/rdc`. Not
   "All repositories" - this token should be able to touch nothing else.
3. **Permissions:** under Repository permissions, set **Actions: Read and
   write**. Everything else stays "No access."
4. Expiration: 90 days is fine - GitHub will email before it lapses, and
   renewing is steps 1-3 again plus updating the header in step 2 below.
5. Generate it and copy the token. It's shown once.

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
8. **Payload:** a fixed body, not a projection - GitHub only accepts a JSON
   object with `event_type`. Set it to exactly:
   ```json
   {"event_type": "sanity-publish"}
   ```
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
