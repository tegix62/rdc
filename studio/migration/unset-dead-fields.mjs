/*
  Clears the stored values of fields that have been removed from the schema.

  WHY THIS IS NEEDED AT ALL

  Deleting a field from a Sanity schema does not delete the data. The values
  stay in the dataset, and Studio then shows every affected document a banner:
  "Found fields that are not defined in the schema." So removing five dead
  fields without this script would have swapped one kind of noise for a louder
  kind - on 74 case studies and all 5 blog posts.

  WHAT IT UNSETS, AND WHY EACH IS SAFE

    caseStudy.featured      74/75 filled, read by nothing in src/
    blogPost.featured        5/5  filled, read by nothing
    blogPost.color           1/5  filled, read by nothing
    blogPost.length          2/5  filled, read by nothing
    siteSettings.navLinks    0/1  filled, read by nothing - the nav is a
                                  hardcoded list in src/layouts/Layout.astro

  "Read by nothing" was checked two ways: the automated CMS audit
  (scripts/audit-cms.mjs) for `featured`, and by hand for the other three,
  because the audit matches on field NAME and `color`, `length` and `navLinks`
  all appear in src/ for unrelated reasons - CSS colour, Array.length, and a
  local variable in Layout.astro. That is a real blind spot in the audit and the
  reason this list is not simply its DEAD section.

  Nothing here affects the rendered site. If any of it turns out to be wrong,
  the values are recoverable from dataset history for as long as the plan
  retains it - but the safer answer is --dry-run first, which is the default.

  Usage:
    node studio/migration/unset-dead-fields.mjs             # dry run, prints only
    node studio/migration/unset-dead-fields.mjs --commit    # actually writes
*/
import {createClient} from '@sanity/client'

const COMMIT = process.argv.includes('--commit')

const DEAD = [
  {type: 'caseStudy', fields: ['featured']},
  {type: 'blogPost', fields: ['featured', 'color', 'length']},
  {type: 'siteSettings', fields: ['navLinks']},
]

const token = process.env.SANITY_API_TOKEN
if (COMMIT && !token) {
  console.error('SANITY_API_TOKEN is required to --commit.')
  process.exit(1)
}

const client = createClient({
  projectId: '8337vjtf',
  dataset: 'production',
  apiVersion: '2024-01-01',
  useCdn: false,
  token,
})

let totalDocs = 0
let totalFields = 0

for (const {type, fields} of DEAD) {
  /*
    `defined()` on any of the fields, so this only touches documents that
    actually carry one. Patching a document that has none would bump its
    updatedAt for no reason and make the report meaningless.
  */
  const filter = fields.map((f) => `defined(${f})`).join(' || ')
  const docs = await client.fetch(
    `*[_type == $type && (${filter})]{_id, ${fields.join(', ')}}`,
    {type},
  )

  if (!docs.length) {
    console.log(`${type}: nothing to clear`)
    continue
  }

  console.log(`\n${type}: ${docs.length} document(s) carry a removed field`)
  for (const doc of docs) {
    const present = fields.filter((f) => doc[f] !== undefined && doc[f] !== null)
    totalFields += present.length
    console.log(`  ${doc._id}  unset: ${present.join(', ')}`)
    if (COMMIT) {
      await client.patch(doc._id).unset(present).commit({visibility: 'async'})
    }
  }
  totalDocs += docs.length
}

console.log(
  `\n${COMMIT ? 'Cleared' : 'Would clear'} ${totalFields} field value(s) ` +
    `across ${totalDocs} document(s).`,
)

/*
  After committing, READ IT BACK and fail if anything survived.

  THE MISTAKE THIS PREVENTS, WHICH ALREADY HAPPENED

  This migration was reported as run and verified. It had not been run. What was
  almost certainly read as success was a DRY RUN's output - "Would clear 88 field
  value(s) across 85 document(s)" - which is a sentence about the future written
  in the same shape as a sentence about the past. Nothing in the output
  distinguished a plan from an outcome at a glance, and 85 documents kept a dead
  `featured` field for weeks until Studio refused to publish one of them and
  Chris hit it.

  So "done" is no longer something a reader has to infer. A committing run
  re-queries the dataset afterwards and asserts zero, and exits non-zero if not,
  which also turns a partially-failed batch of patches into a red workflow
  instead of a hopeful log line.

  A dry run deliberately skips this: it changed nothing, so of course everything
  is still there.
*/
if (COMMIT) {
  let remaining = 0
  for (const {type, fields} of DEAD) {
    const filter = fields.map((f) => `defined(${f})`).join(' || ')
    const still = await client.fetch(`count(*[_type == $type && (${filter})])`, {type})
    if (still) {
      console.error(`  STILL PRESENT: ${type} - ${still} document(s)`)
      remaining += still
    }
  }
  if (remaining) {
    console.error(
      `\nVERIFICATION FAILED: ${remaining} document(s) still carry a removed field. ` +
        `The patches did not all land - re-run.`,
    )
    process.exit(1)
  }
  console.log('Verified by reading the dataset back: 0 documents still carry a removed field.')
}
/*
  Loud, because the quiet version of this line is what got misread. "Would clear
  88 field values across 85 documents" is a sentence about the FUTURE written in
  the same shape as a sentence about the past, and it was taken for a completed
  run. A dry run should be impossible to mistake for an outcome.
*/
if (!COMMIT) {
  console.log(
    '\n*** DRY RUN - NOTHING WAS WRITTEN. Nothing above has happened. ***\n' +
      '*** Re-run with --commit to actually clear these. ***',
  )
}
