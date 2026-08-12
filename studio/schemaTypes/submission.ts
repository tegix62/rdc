import {defineField, defineType} from 'sanity'

/*
  A contact-form enquiry. Written by functions/api/contact.ts, the Cloudflare
  Function behind /contact - not by anyone typing in Studio. This schema exists
  so an enquiry shows up next to the work it is about, in the tool Chris already
  has open, instead of in a third-party form product's own dashboard.

  STATUS IS THE ONLY FIELD MEANT TO BE HAND-EDITED. Everything else is what the
  person typed, verbatim - changing it would mean Studio disagreeing with what
  they actually sent.

  RETENTION. The privacy policy says contact submissions are kept "up to two
  years, then we delete them." That promise is enforced by a scheduled cleanup
  (see scripts/delete-old-submissions.mjs), not by anything in this schema - a
  document type cannot expire itself. If that script is ever removed, the
  promise silently stops being true.
*/
export default defineType({
  name: 'submission',
  title: 'Contact form submissions',
  type: 'document',
  // No one composes one of these by hand, so there is nothing to validate
  // against a blank form - every field below is required at the Function
  // level, not here, and repeating that here would just be a second place for
  // the two checks to disagree.
  fields: [
    defineField({
      name: 'name',
      title: 'Name',
      type: 'string',
      readOnly: true,
    }),
    defineField({
      name: 'email',
      title: 'Email',
      type: 'string',
      readOnly: true,
    }),
    defineField({
      name: 'company',
      title: 'Company / organisation',
      type: 'string',
      readOnly: true,
      description: 'Optional on the form, so this is often empty.',
    }),
    defineField({
      name: 'businessDescription',
      title: 'How they described their business',
      type: 'text',
      readOnly: true,
    }),
    defineField({
      name: 'goals',
      title: 'What they want help with',
      type: 'text',
      readOnly: true,
    }),
    defineField({
      name: 'seriousness',
      title: 'Self-rated seriousness (0-10)',
      type: 'number',
      readOnly: true,
    }),
    defineField({
      name: 'timeframe',
      title: 'Timeframe / deadline',
      type: 'string',
      readOnly: true,
    }),
    /*
      The budget slider's two handles. `budgetOpenEnded` is true when the top
      handle is dragged to the far end - the form's "$6,000+" - in which case
      budgetMax is not a real number and is left unset rather than filled with
      a value nobody chose.
    */
    defineField({
      name: 'budgetMin',
      title: 'Budget - low end',
      type: 'number',
      readOnly: true,
    }),
    defineField({
      name: 'budgetMax',
      title: 'Budget - high end',
      type: 'number',
      readOnly: true,
      description: 'Empty when they picked the open-ended top of the range ("$6,000+").',
    }),
    defineField({
      name: 'budgetOpenEnded',
      title: 'Budget is open-ended ("6,000+")',
      type: 'boolean',
      readOnly: true,
    }),
    defineField({
      name: 'budgetNotSure',
      title: 'Chose "Not sure yet"',
      type: 'boolean',
      readOnly: true,
      description: 'When true, the two budget numbers above are not meaningful - they still hold whatever the slider was last at, since sliders do not have an empty state.',
    }),
    defineField({
      name: 'foundVia',
      title: 'How they found you',
      type: 'string',
      readOnly: true,
    }),
    defineField({
      name: 'phone',
      title: 'Phone',
      type: 'string',
      readOnly: true,
      description: 'For a discovery call only - stated as much on the form itself.',
    }),
    defineField({
      name: 'submittedAt',
      title: 'Submitted',
      type: 'datetime',
      readOnly: true,
    }),
    /*
      The one field anyone actually edits. New by default; move it along as
      you work an enquiry. This is deliberately not a richer CRM pipeline -
      three states, so triaging fifteen enquiries stays a five-second glance
      at the list rather than a system to maintain.
    */
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      initialValue: 'new',
      options: {
        list: [
          {title: 'New', value: 'new'},
          {title: 'Replied', value: 'replied'},
          {title: 'Archived', value: 'archived'},
        ],
        layout: 'radio',
      },
    }),
  ],
  orderings: [
    {
      title: 'Newest first',
      name: 'submittedAtDesc',
      by: [{field: 'submittedAt', direction: 'desc'}],
    },
  ],
  preview: {
    select: {
      name: 'name',
      company: 'company',
      status: 'status',
      submittedAt: 'submittedAt',
    },
    prepare({name, company, status, submittedAt}) {
      const date = submittedAt ? new Date(submittedAt).toLocaleDateString() : '?'
      const badge = status === 'new' ? '\u{1F7E2}' : status === 'replied' ? '✅' : '\u{1F5C4}️'
      return {
        title: `${badge} ${name ?? 'Unnamed'}${company ? ` — ${company}` : ''}`,
        subtitle: date,
      }
    },
  },
})
