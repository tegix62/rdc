// One-time content migration: Webflow -> Sanity.
// Reads the JSON snapshots in migration/data/ (pulled from the live Webflow
// site) and creates matching documents in Sanity, re-uploading images so the
// site no longer depends on Webflow's CDN.
//
// Run from the studio/ directory: node migration/migrate.mjs
// Requires SANITY_API_TOKEN (an Editor token) in the environment.

import {createClient} from '@sanity/client'
import {parse} from 'node-html-parser'
import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.join(__dirname, 'data')

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

const readJson = (name) => JSON.parse(readFileSync(path.join(dataDir, name), 'utf8'))

const CATEGORY_MAP = {
  '25b184027eb70b18d6c7b600aee158e8': 'Brand Identity',
  '9401f9935a5e974e1aafa54688842d7d': 'Merch & Apparel',
  '434c6f273e30a5b44173206a70f0a63b': 'Typography',
  '72001b43acecb4bd274abbeb9fc58dc3': 'Illustration',
  c497ce92016cc5970b75f3a85057a17f: 'Photography',
}

const PAGE_TYPE_MAP = {
  fe92c4128e0b88d25b07ac4e6e5be73e: 'Case Study',
  '0c620181eb950586857a49b6a0f28794': 'Grid Item',
}

const ASSET_TYPE_MAP = {
  '032e41b2c574d96f3a7c416507dc4808': 'Identity / Brand Sheet',
  '403ad05267e3b23ac0f4b2e1fb77eabb': 'Apparel',
  '4acd410cd0e162887b5582676e96717b': 'Social Card',
  '690572630320e39b9dfa6d55fb8f087a': 'Wide Video',
  f4844e1379c0f352873860d52a4f577b: 'Packaging',
  b1abe0932974a8af432ad2d9811c8798: 'Vinyl / Record',
}

// url -> uploaded asset _id, so the same Webflow image is only uploaded once.
const imageCache = new Map()

async function uploadImage(field) {
  // Returning undefined (not null) means the key gets dropped from the
  // document entirely instead of being stored as a literal `null`, which
  // Sanity's editor flags as a type mismatch for an `image` field.
  if (!field || !field.url) return undefined
  if (imageCache.has(field.url)) {
    return {_type: 'image', asset: {_type: 'reference', _ref: imageCache.get(field.url)}}
  }
  const res = await fetch(field.url)
  if (!res.ok) {
    console.warn(`  ! image fetch failed (${res.status}): ${field.url}`)
    return undefined
  }
  const buffer = Buffer.from(await res.arrayBuffer())
  const filename = decodeURIComponent(field.url.split('/').pop().split('?')[0])
  const asset = await client.assets.upload('image', buffer, {filename})
  imageCache.set(field.url, asset._id)
  return {_type: 'image', asset: {_type: 'reference', _ref: asset._id}}
}

async function uploadImages(fields) {
  const out = []
  for (const field of fields || []) {
    const img = await uploadImage(field)
    if (img) out.push({...img, _key: cryptoRandomKey()})
  }
  return out
}

function cryptoRandomKey() {
  return Math.random().toString(36).slice(2, 10)
}

// Converts the small set of HTML tags Webflow's rich text editor produces
// (p, h2-h4, ul/ol/li, a, strong/b, em/i) into Sanity portable text blocks.
function htmlToBlocks(html) {
  if (!html) return []
  const root = parse(html)
  const blocks = []

  const styleFor = (tag) =>
    ({h1: 'h1', h2: 'h2', h3: 'h3', h4: 'h4'})[tag] || 'normal'

  function inlineChildren(node, markDefs, marks = []) {
    const spans = []
    for (const child of node.childNodes) {
      if (child.nodeType === 3) {
        const text = child.rawText.replace(/ /g, ' ').replace(/‍/g, '')
        if (text) spans.push({_type: 'span', _key: cryptoRandomKey(), text, marks})
        continue
      }
      const tag = child.tagName?.toLowerCase()
      if (tag === 'a') {
        const key = cryptoRandomKey()
        markDefs.push({_type: 'link', _key: key, href: child.getAttribute('href') || ''})
        spans.push(...inlineChildren(child, markDefs, [...marks, key]))
      } else if (tag === 'strong' || tag === 'b') {
        spans.push(...inlineChildren(child, markDefs, [...marks, 'strong']))
      } else if (tag === 'em' || tag === 'i') {
        spans.push(...inlineChildren(child, markDefs, [...marks, 'em']))
      } else if (tag === 'br') {
        spans.push({_type: 'span', _key: cryptoRandomKey(), text: '\n', marks})
      } else {
        spans.push(...inlineChildren(child, markDefs, marks))
      }
    }
    return spans
  }

  function textBlock(node, style) {
    const markDefs = []
    const children = inlineChildren(node, markDefs)
    if (!children.length || children.every((c) => !c.text.trim())) return null
    return {_type: 'block', _key: cryptoRandomKey(), style, markDefs, children}
  }

  for (const node of root.childNodes) {
    const tag = node.tagName?.toLowerCase()
    if (!tag) continue
    if (tag === 'ul' || tag === 'ol') {
      for (const li of node.querySelectorAll('li')) {
        const block = textBlock(li, 'normal')
        if (block) {
          block.listItem = tag === 'ul' ? 'bullet' : 'number'
          block.level = 1
          blocks.push(block)
        }
      }
    } else if (tag === 'p' || tag.startsWith('h')) {
      const block = textBlock(node, styleFor(tag))
      if (block) blocks.push(block)
    }
  }
  return blocks
}

// Case study page layouts, keyed by slug. Images are referenced by their
// original Webflow URL and run through the same uploadImage() helper as
// everything else, so a section reusing a project photo resolves to the
// asset already uploaded for that project rather than a duplicate.
//
// This lives in the migration (rather than a separate patch script) on
// purpose: migrateWork() does a full createOrReplace per document, so any
// sections/credits/accentColor applied out-of-band get wiped on the next
// migration run. Keeping them here means they survive.
async function buildSections(defs) {
  if (!defs || !defs.length) return undefined
  const out = []
  for (const def of defs) {
    const key = cryptoRandomKey()
    const img = async (url) => (url ? uploadImage({url}) : undefined)
    switch (def.type) {
      case 'fullImage': {
        const image = await img(def.image)
        if (image) out.push({_key: key, _type: 'fullImageSection', image})
        break
      }
      case 'twoUp': {
        const [imageLeft, imageRight] = [await img(def.imageLeft), await img(def.imageRight)]
        if (imageLeft || imageRight)
          out.push({_key: key, _type: 'twoUpSection', imageLeft, imageRight})
        break
      }
      case 'threeUp': {
        const [imageOne, imageTwo, imageThree] = [
          await img(def.imageOne),
          await img(def.imageTwo),
          await img(def.imageThree),
        ]
        if (imageOne || imageTwo || imageThree)
          out.push({_key: key, _type: 'threeUpSection', imageOne, imageTwo, imageThree})
        break
      }
      case 'imageText': {
        out.push({
          _key: key,
          _type: 'imageTextSection',
          image: await img(def.image),
          imagePosition: def.position === 'Right' ? 'Right' : 'Left',
          heading: def.heading || undefined,
          text: def.text || undefined,
        })
        break
      }
      case 'video': {
        if (def.url)
          out.push({_key: key, _type: 'videoSection', url: def.url, caption: def.caption || undefined})
        break
      }
      default:
        console.warn(`  ! unknown section type: ${def.type}`)
    }
  }
  return out.length ? out : undefined
}

async function migrateWork() {
  const items = readJson('work.json')
  // Optional file — case studies with no entry keep the simple fallback layout.
  let layouts = {}
  try {
    layouts = readJson('caseStudyLayouts.json')
  } catch {
    console.log('No caseStudyLayouts.json found; skipping section layouts.')
  }
  console.log(`Migrating ${items.length} case study / grid items...`)
  let i = 0
  // Pass 1: create every document without the parentBrand reference. Items
  // are only guaranteed to reference IDs of items *somewhere* in this same
  // collection, not necessarily ones created earlier, so references have to
  // be wired up in a second pass once every document is known to exist.
  for (const item of items) {
    i += 1
    const doc = {
      _id: `caseStudy-${item.id}`,
      _type: 'caseStudy',
      title: item.name,
      slug: {_type: 'slug', current: item.slug},
      pageType: PAGE_TYPE_MAP[item.pageType] || undefined,
      category: CATEGORY_MAP[item.category] || undefined,
      assetType: ASSET_TYPE_MAP[item.assetType] || undefined,
      featured: !!item.featured,
      heroTile: !!item.heroTile,
      headline: item.headline || undefined,
      subtitle: item.subtitle || undefined,
      resultStat: item.resultStat || undefined,
      client: item.client || undefined,
      oneLineSummary: item.oneLineSummary || undefined,
      summary: item.summary || undefined,
      principalType: item.principalType || undefined,
      filmEmbed: item.filmEmbed || undefined,
      body: htmlToBlocks(item.projectDetailsHtml),
      servicesRendered: htmlToBlocks(item.servicesRenderedHtml),
    }

    doc.thumbnail = await uploadImage(item.thumbnail)
    doc.archiveMark = await uploadImage(item.archiveMark)
    doc.mainImage = await uploadImage(item.mainImage)
    doc.clientLogo = await uploadImage(item.clientLogo)
    doc.merchGrid = await uploadImages(item.merchGrid)
    doc.flyerGrid = await uploadImages(item.flyerGrid)
    doc.processGrid = await uploadImages(item.processGrid)

    const layout = layouts[item.slug]
    if (layout) {
      doc.accentColor = layout.accentColor || undefined
      doc.credits = layout.credits?.length
        ? layout.credits.map((c) => ({_key: cryptoRandomKey(), ...c}))
        : undefined
      doc.sections = await buildSections(layout.sections)
    }

    await client.createOrReplace(doc)
    console.log(`  [${i}/${items.length}] ${item.name}`)
  }

  // Pass 2: wire up parentBrand references now that every document exists.
  const withParent = items.filter((item) => item.parentBrand)
  console.log(`Linking ${withParent.length} parent brand references...`)
  for (const item of withParent) {
    await client
      .patch(`caseStudy-${item.id}`)
      .set({parentBrand: {_type: 'reference', _ref: `caseStudy-${item.parentBrand}`}})
      .commit()
  }
}

async function migrateBlogPosts() {
  const items = readJson('blogPosts.json')
  console.log(`Migrating ${items.length} blog posts...`)
  let i = 0
  for (const item of items) {
    i += 1
    const doc = {
      _id: `blogPost-${item.id}`,
      _type: 'blogPost',
      title: item.name,
      slug: {_type: 'slug', current: item.slug},
      excerpt: item.excerpt || undefined,
      featured: !!item.featured,
      color: item.color || undefined,
      publishedAt: item.date || undefined,
      author: item.author || undefined,
      length: item.length || undefined,
      metaDescription: item.metaDescription || undefined,
      body: htmlToBlocks(item.bodyHtml),
    }
    doc.mainImage = await uploadImage(item.mainImage)
    doc.thumbnailImage = await uploadImage(item.thumbnailImage)

    await client.createOrReplace(doc)
    console.log(`  [${i}/${items.length}] ${item.name}`)
  }
}

async function migratePages() {
  const items = readJson('pages.json')
  console.log(`Migrating ${items.length} pages...`)
  for (const item of items) {
    const doc = {
      _id: `page-${item.slug}`,
      _type: 'page',
      title: item.title,
      slug: {_type: 'slug', current: item.slug},
      seoDescription: item.seoDescription || undefined,
      // Real page copy pulled from the live Webflow pages. Without this the
      // templates fall through to their "Content coming soon" placeholder,
      // which is what About and Video were showing despite being in the nav.
      body: htmlToBlocks(item.bodyHtml),
    }
    if (item.heroImage) doc.heroImage = await uploadImage({url: item.heroImage})
    await client.createOrReplace(doc)
    console.log(`  - ${item.title}${item.bodyHtml ? '' : ' (no body copy)'}`)
  }
}

async function migrateSiteSettings() {
  console.log('Migrating site settings...')
  const portrait = await uploadImage({
    url: 'https://s3.amazonaws.com/webflow-prod-assets/66295bdafa62074ef5551950/6670908ca14bc37ee330f293_Portrait%20-%20BLUE%20002885.webp',
  })
  // The real homepage hero background: an animated WebP of Hug a Mug's
  // Pisces zodiac shirt design being printed, behind a navy overlay.
  const heroBackground = await uploadImage({
    url: 'https://s3.amazonaws.com/webflow-prod-assets/66295bdafa62074ef5551950/66cf805ab7bdefd5798b95d1_Pisces-Anim.webp',
  })

  const logo = await uploadImage({
    url: 'https://s3.amazonaws.com/webflow-prod-assets/66295bdafa62074ef5551950/66709a80ab722c54b9b1c3da_RumeauDesignBLUEflat.webp',
  })

  const proofBandBackground = await uploadImage({
    url: 'https://s3.amazonaws.com/webflow-prod-assets/66295bdafa62074ef5551950/6670b42c30b4a0396315af4c_SketchSheet-01-BLUE.webp',
  })

  // The real homepage logo strip: 5 marks (Adelante Barbell Club appears
  // twice, once as its shield logo and once as its tee design).
  const logoSources = [
    {
      url: 'https://s3.amazonaws.com/webflow-prod-assets/66295bdafa62074ef5551950/6643b0319d19ed441c36cfde_Container-Bright-Bone.webp',
      alt: 'Reps for Recovery logo',
      href: '/work/reps-for-recovery',
    },
    {
      url: 'https://s3.amazonaws.com/webflow-prod-assets/66295bdafa62074ef5551950/6670b57789a97751cca5e307_6643f9c169eccf09b3cc0500_2022Asset%2010%404x.webp',
      alt: 'DumpStat Podcast logo',
      href: '/work/dumpstat',
    },
    {
      url: 'https://s3.amazonaws.com/webflow-prod-assets/66295bdafa62074ef5551950/6670b4d58fd116960f4928ed_Hug_A_Mug_2022-Regular_Variants_Negative.webp',
      alt: 'Hug a Mug Coffeehouse logo',
      href: '/work/hug-a-mug',
    },
    {
      url: 'https://s3.amazonaws.com/webflow-prod-assets/66295bdafa62074ef5551950/6643f92b70d0186b5316e3eb_Asset%201.webp',
      alt: 'Adelante Barbell Club shield logo',
      href: '/work/adelante-barbell-club',
    },
    {
      url: 'https://s3.amazonaws.com/webflow-prod-assets/66295bdafa62074ef5551950/6643b22738a1fdf6e315915f_abc-final-skull.webp',
      alt: 'Adelante Barbell Club tee design',
      href: '/work/adelante-barbell-club',
    },
  ]
  const clientLogos = []
  for (const src of logoSources) {
    const logo = await uploadImage({url: src.url})
    if (logo) clientLogos.push({_key: cryptoRandomKey(), _type: 'object', logo, alt: src.alt, href: src.href})
  }

  await client.createOrReplace({
    _id: 'siteSettings',
    _type: 'siteSettings',
    siteTitle: 'Rumeau Design Co',
    tagline: 'Brand Identity & Merch Design for Heritage Apparel Brands.',
    portrait,
    heroBackground,
    proofBandBackground,
    logo,
    clientLogos,
    socialLinks: [
      {_key: cryptoRandomKey(), platform: 'Instagram', url: 'https://www.instagram.com/rumeaudesign.co'},
    ],
  })
  console.log('  - Site Settings')
}

async function main() {
  await migratePages()
  await migrateBlogPosts()
  await migrateWork()
  await migrateSiteSettings()
  console.log('Done.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
