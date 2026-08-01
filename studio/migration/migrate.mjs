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
  if (!field || !field.url) return null
  if (imageCache.has(field.url)) {
    return {_type: 'image', asset: {_type: 'reference', _ref: imageCache.get(field.url)}}
  }
  const res = await fetch(field.url)
  if (!res.ok) {
    console.warn(`  ! image fetch failed (${res.status}): ${field.url}`)
    return null
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

async function migrateWork() {
  const items = readJson('work.json')
  console.log(`Migrating ${items.length} case study / grid items...`)
  let i = 0
  for (const item of items) {
    i += 1
    const doc = {
      _id: `caseStudy-${item.id}`,
      _type: 'caseStudy',
      title: item.name,
      slug: {_type: 'slug', current: item.slug},
      pageType: PAGE_TYPE_MAP[item.pageType] || null,
      category: CATEGORY_MAP[item.category] || null,
      assetType: ASSET_TYPE_MAP[item.assetType] || null,
      parentBrand: item.parentBrand
        ? {_type: 'reference', _ref: `caseStudy-${item.parentBrand}`}
        : undefined,
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

    await client.createOrReplace(doc)
    console.log(`  [${i}/${items.length}] ${item.name}`)
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
    await client.createOrReplace({
      _id: `page-${item.slug}`,
      _type: 'page',
      title: item.title,
      slug: {_type: 'slug', current: item.slug},
      seoDescription: item.seoDescription || undefined,
    })
    console.log(`  - ${item.title}`)
  }
}

async function main() {
  await migratePages()
  await migrateBlogPosts()
  await migrateWork()
  console.log('Done.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
