/*
  Where every "Contact" / "Get in Touch" button points when Site Settings does
  not override it.

  One constant rather than the URL written into Layout.astro, index.astro and
  404.astro separately - three copies is how two of them end up pointing at a
  dead form after the fourth is updated, and nothing about a stale contact
  link looks broken until an enquiry never arrives.

  WHY TALLY AND NOT THE NATIVE FORM

  The native /contact form works - built, tested, and proven end to end with a
  real submission that reached Sanity and sent its notification email. It is
  parked anyway, in parked/contact-form/, because it wrote enquiries into this
  project's Sanity dataset and that dataset is public-read: the project ID and
  dataset name are committed in a public repository, so every name, email,
  phone number and budget submitted would have been readable by anyone with no
  credentials at all.

  Making the dataset private is a paid Sanity tier, not a setting, so there
  was no free fix on the storage side. Tally holds enquiries behind its own
  authentication for nothing, which makes it the better choice today even with
  its branding on the form.

  See parked/contact-form/README.md for what it would take to bring the native
  form back.
*/
export const TALLY_FORM_URL = 'https://tally.so/r/mZ8LXz';
