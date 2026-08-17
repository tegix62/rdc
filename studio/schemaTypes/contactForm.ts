import {defineField, defineType} from 'sanity'

/*
  Every word on the /contact page, editable without a deploy.

  WHY THIS IS A DOCUMENT AND NOT PART OF `page`

  There is a `page` document with the slug "contact", and it already supplies
  the browser-tab title and the meta description. It cannot supply the rest:
  the contact page is not a stack of sections like the others, it is a fixed
  five-step form whose labels, help lines and placeholders each attach to a
  specific input. A generic section builder cannot express "this is the help
  line under the second textarea on step two" - so the form's copy gets a
  document shaped like the form.

  EVERY FIELD IS OPTIONAL, ON PURPOSE

  The template keeps the current wording as its fallback, so an empty document
  - or no document at all - renders precisely the form that is live today.
  That matters for two reasons: nothing breaks on the deploy that adds this,
  and clearing a box you did not mean to touch restores the original line
  rather than leaving a gap where a label used to be.

  WHAT IS DELIBERATELY NOT EDITABLE HERE

  Field NAMES (`name`, `email`, `businessDescription` ...) are not exposed.
  They are the keys the submission is stored under in D1 and printed under in
  the notification email, so renaming one in Studio would silently stop that
  answer being recorded. The visible label is yours; the storage key is the
  code's.

  The 0-10 scale's numbers are not editable either - the scale is generated
  from a count, and "0 to 10" is wired into the radio group's accessible name
  and the stored value. Its question is editable; its numbers are not.
*/
export default defineType({
  name: 'contactForm',
  title: 'Contact Form',
  type: 'document',
  groups: [
    {name: 'top', title: 'Page top', default: true},
    {name: 'step1', title: '1. Welcome'},
    {name: 'step2', title: '2. Your business'},
    {name: 'step3', title: '3. The scale'},
    {name: 'step4', title: '4. Logistics'},
    {name: 'step5', title: '5. Phone'},
    {name: 'done', title: 'Buttons & thank-you'},
  ],
  fields: [
    // --- Page top ----------------------------------------------------------
    defineField({
      name: 'heading',
      title: 'Page heading',
      type: 'string',
      group: 'top',
      description: 'The h1 at the top of /contact. Defaults to "Let\'s Work Together".',
    }),
    defineField({
      name: 'intro',
      title: 'Intro line, under the heading',
      type: 'text',
      rows: 2,
      group: 'top',
      description:
        'Defaults to "This form takes about a minute. I read every one myself - ' +
        'there is no team, no CRM, just me."',
    }),

    // --- Step 1 ------------------------------------------------------------
    defineField({
      name: 'step1Heading',
      title: 'Step heading',
      type: 'string',
      group: 'step1',
      description: 'Defaults to "Welcome!".',
    }),
    defineField({
      name: 'step1Copy',
      title: 'Paragraph under the heading',
      type: 'text',
      rows: 3,
      group: 'step1',
    }),
    defineField({
      name: 'nameLabel',
      title: 'Label - full name',
      type: 'string',
      group: 'step1',
      description: 'Defaults to "Full name". Required fields keep their * automatically.',
    }),
    defineField({
      name: 'emailLabel',
      title: 'Label - email address',
      type: 'string',
      group: 'step1',
    }),
    defineField({
      name: 'companyLabel',
      title: 'Label - company (this one is optional to fill in)',
      type: 'string',
      group: 'step1',
    }),

    // --- Step 2 ------------------------------------------------------------
    defineField({
      name: 'step2Heading',
      title: 'Step heading',
      type: 'string',
      group: 'step2',
      description: 'Defaults to "Your business".',
    }),
    defineField({
      name: 'businessLabel',
      title: 'Question 1',
      type: 'string',
      group: 'step2',
      description: 'Defaults to "How would you describe your business?".',
    }),
    defineField({
      name: 'businessHelp',
      title: 'Question 1 - small grey help line under it',
      type: 'string',
      group: 'step2',
    }),
    defineField({
      name: 'businessPlaceholder',
      title: 'Question 1 - faint text inside the empty box',
      type: 'string',
      group: 'step2',
      description:
        'Placeholder text disappears the moment someone starts typing, so it can ' +
        'never hold an instruction they still need. Keep instructions in the help ' +
        'line above.',
    }),
    defineField({
      name: 'goalsLabel',
      title: 'Question 2',
      type: 'string',
      group: 'step2',
      description: 'Defaults to "How can I help?".',
    }),
    defineField({
      name: 'goalsHelp',
      title: 'Question 2 - small grey help line under it',
      type: 'string',
      group: 'step2',
    }),
    defineField({
      name: 'goalsPlaceholder',
      title: 'Question 2 - faint text inside the empty box',
      type: 'string',
      group: 'step2',
    }),

    // --- Step 3 ------------------------------------------------------------
    defineField({
      name: 'step3Heading',
      title: 'The question above the 0-10 buttons',
      type: 'text',
      rows: 2,
      group: 'step3',
      description:
        'Defaults to "On a scale of 1 to 10, how serious are you about reaching ' +
        'your goals?". The numbers themselves are fixed at 0-10 - they are what ' +
        'gets stored with the enquiry.',
    }),

    // --- Step 4 ------------------------------------------------------------
    defineField({
      name: 'step4Heading',
      title: 'Step heading',
      type: 'string',
      group: 'step4',
      description: 'Defaults to "Logistics".',
    }),
    defineField({
      name: 'timeframeLabel',
      title: 'Label - timeframe',
      type: 'string',
      group: 'step4',
    }),
    defineField({
      name: 'timeframeHelp',
      title: 'Timeframe - small grey help line under it',
      type: 'string',
      group: 'step4',
    }),
    defineField({
      name: 'budgetLabel',
      title: 'Label - budget slider',
      type: 'string',
      group: 'step4',
      description:
        'Defaults to "What\'s the budget?". The slider\'s own range ($1,500 to ' +
        '$6,000+) is set in code, not here - changing what the form asks for is a ' +
        'pricing decision rather than a copy edit.',
    }),
    defineField({
      name: 'budgetHelp',
      title: 'Budget - small grey help line under it',
      type: 'string',
      group: 'step4',
      description: 'Defaults to "(Estimate)".',
    }),
    defineField({
      name: 'budgetNotSureLabel',
      title: 'Budget - the tickbox under the slider',
      type: 'string',
      group: 'step4',
      description: 'Defaults to "Not sure yet - want to discuss".',
    }),
    defineField({
      name: 'foundViaLabel',
      title: 'Label - how they found you',
      type: 'string',
      group: 'step4',
    }),
    defineField({
      name: 'foundViaPlaceholder',
      title: 'How they found you - faint text inside the empty box',
      type: 'string',
      group: 'step4',
    }),

    // --- Step 5 ------------------------------------------------------------
    defineField({
      name: 'step5Heading',
      title: 'Step heading',
      type: 'string',
      group: 'step5',
      description: 'Defaults to "What\'s the best phone number to reach you?".',
    }),
    defineField({
      name: 'step5Copy',
      title: 'Reassurance line under it',
      type: 'text',
      rows: 2,
      group: 'step5',
      description:
        'Defaults to "(This will only be used for a Discovery Call between the two ' +
        'of us.)". The spam check sits directly below this, and it is the last ' +
        'thing anyone reads before submitting.',
    }),

    // --- Buttons and the thank-you box --------------------------------------
    defineField({
      name: 'backLabel',
      title: 'Button - back',
      type: 'string',
      group: 'done',
      description: 'Defaults to "← Back".',
    }),
    defineField({
      name: 'nextLabel',
      title: 'Button - next',
      type: 'string',
      group: 'done',
      description: 'Defaults to "Next →".',
    }),
    defineField({
      name: 'submitLabel',
      title: 'Button - submit',
      type: 'string',
      group: 'done',
      description: 'Defaults to "Submit →".',
    }),
    defineField({
      name: 'doneHeading',
      title: 'Thank-you heading',
      type: 'string',
      group: 'done',
      description:
        'Shown in place of the form once it has sent. Defaults to "Thanks for ' +
        'filling this out!".',
    }),
    defineField({
      name: 'doneBody',
      title: 'Thank-you line',
      type: 'string',
      group: 'done',
      description:
        'Defaults to "I\'ll get back to you soon." It is a link back to the ' +
        'homepage, which is the only way out of this screen - so keep it as ' +
        'something worth clicking.',
    }),
    defineField({
      name: 'doneSignature',
      title: 'Thank-you sign-off',
      type: 'string',
      group: 'done',
      description: 'Defaults to "- Chris Rumeau, Rumeau Design Co".',
    }),
  ],
  preview: {
    prepare() {
      return {title: 'Contact Form', subtitle: 'Copy for every step of /contact'}
    },
  },
})
