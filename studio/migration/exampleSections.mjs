// One-off demo: populates the Hug a Mug case study with the new
// Sections block system, reusing images already migrated onto that
// same document (no new uploads) so Chris can see the layout system
// rendered with real content instead of empty schema fields.
//
// Run from the studio/ directory: node migration/exampleSections.mjs
// Requires SANITY_API_TOKEN in the environment.

import {createClient} from '@sanity/client'

const token = process.env.SANITY_API_TOKEN
if (!token) {
  console.error('Missing SANITY_API_TOKEN')
  process.exit(1)
}

const client = createClient({
  projectId: '8337vjtf',
  dataset: 'production',
  apiVersion: '2024-01-01',
  token,
  useCdn: false,
})

const key = () => Math.random().toString(36).slice(2, 10)
const imageRef = (asset) =>
  asset ? {_type: 'image', asset: {_type: 'reference', _ref: asset.asset._ref}} : undefined

async function main() {
  const doc = await client.fetch(
    `*[_type == "caseStudy" && slug.current == "hug-a-mug"][0]{
      _id, title, mainImage, thumbnail, clientLogo, merchGrid, flyerGrid, processGrid
    }`,
  )
  if (!doc) {
    console.error('hug-a-mug case study not found')
    process.exit(1)
  }

  const gallery = [...(doc.merchGrid || []), ...(doc.flyerGrid || []), ...(doc.processGrid || [])]
  const pick = (i) => gallery[i] || doc.mainImage

  const sections = [
    {
      _key: key(),
      _type: 'fullImageSection',
      image: imageRef(doc.mainImage),
    },
    {
      _key: key(),
      _type: 'twoUpSection',
      imageLeft: imageRef(pick(0)),
      imageRight: imageRef(pick(1)),
    },
    {
      _key: key(),
      _type: 'imageTextSection',
      image: imageRef(doc.clientLogo || doc.thumbnail),
      imagePosition: 'Left',
      heading: 'PLACEHOLDER — replace with real copy',
      text: 'PLACEHOLDER: a short paragraph about this part of the project — the brief, the craft process, or a client quote. Swap this image for a real in-context shot when you have one.',
    },
    {
      _key: key(),
      _type: 'threeUpSection',
      imageOne: imageRef(pick(2)),
      imageTwo: imageRef(pick(3)),
      imageThree: imageRef(pick(4)),
    },
    // No videoSection included — there's no real video asset for this
    // project migrated yet, so a placeholder embed would just be a
    // fake external video. Add one manually in Studio once you have
    // a real Vimeo/YouTube link for this project.
  ]

  await client
    .patch(doc._id)
    .set({
      accentColor: '#EDE6D6',
      credits: [
        {_key: key(), role: 'PLACEHOLDER Creative Direction', name: 'Chris Rumeau'},
        {_key: key(), role: 'PLACEHOLDER Illustration', name: 'Chris Rumeau'},
        {_key: key(), role: 'PLACEHOLDER Client', name: 'Hug a Mug Coffeehouse & Ceramics Studio'},
      ],
      sections,
    })
    .commit()

  console.log(`Patched ${doc.title} (${doc._id}) with example sections.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
