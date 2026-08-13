import {defineField, defineType} from 'sanity'

/*
  Drop-off analytics for /contact - the thing Tally sold at its $29/month
  tier, built as five running counters instead of Tally's per-visitor
  records.

  ONE DOCUMENT, NEVER MORE. functions/api/form-progress.ts always writes to
  the fixed id `formFunnel.contact`, so this document is created once and
  incremented forever - not one document per visitor, which would grow
  without bound and need the same retention policy the `submission` type
  already needs (see delete-old-submissions.mjs, once that exists). A
  counter has no "old" to delete.

  NO PERSONAL DATA, ANYWHERE IN THIS TYPE. The client-side ping that
  increments a field carries a form name and a step number - nothing that
  identifies a visitor, no session id, no IP captured beyond what Cloudflare's
  own edge logs already do for every request regardless of this feature (see
  the privacy policy's "Who else is involved" section). That is what makes
  this different from what the privacy policy's "we do not run analytics of
  any kind" line was written to rule out - the sentence needed a precise
  carve-out rather than staying blanket-true by accident, which is why
  content/privacy-policy.md has a paragraph naming this exact feature.
*/
export default defineType({
  name: 'formFunnel',
  title: 'Form drop-off counts',
  type: 'document',
  fields: [
    defineField({
      name: 'formName',
      title: 'Form',
      type: 'string',
      readOnly: true,
    }),
    defineField({
      name: 'since',
      title: 'Counting since',
      type: 'datetime',
      readOnly: true,
      description: 'Set once, the first time this form was ever visited. Never changes - it is the denominator for reading the numbers below as a rate rather than a bare count.',
    }),
    defineField({
      name: 'step1',
      title: 'Reached: Welcome (name, email, company)',
      type: 'number',
      initialValue: 0,
    }),
    defineField({
      name: 'step2',
      title: 'Reached: Your business',
      type: 'number',
      initialValue: 0,
    }),
    defineField({
      name: 'step3',
      title: 'Reached: Seriousness scale',
      type: 'number',
      initialValue: 0,
    }),
    defineField({
      name: 'step4',
      title: 'Reached: Logistics (budget, timeframe)',
      type: 'number',
      initialValue: 0,
    }),
    defineField({
      name: 'step5',
      title: 'Reached: Phone + spam check',
      type: 'number',
      initialValue: 0,
      description: 'Compare this against the count of Contact form submissions - the gap between them is people who reached the last step and then did not submit, which this alone cannot explain (closed the tab, failed the spam check, second thoughts).',
    }),
  ],
  preview: {
    select: {step1: 'step1', step5: 'step5', since: 'since'},
    prepare({step1, step5, since}) {
      const date = since ? new Date(since).toLocaleDateString() : '?'
      return {
        title: `${step1 ?? 0} started -> ${step5 ?? 0} reached the last step`,
        subtitle: `Since ${date}`,
      }
    },
  },
})
