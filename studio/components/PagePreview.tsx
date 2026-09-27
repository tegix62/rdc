import {Card, Flex, Stack, Text, Button} from '@sanity/ui'
import type {UserViewComponent} from 'sanity/structure'

/*
  THE PAGE, BESIDE THE FORM.

  The Presentation tab already previews the site, but it is a separate
  destination: you leave the document, find the page, and come back. This is
  the same site docked to the document you are editing, so building a page
  and looking at it stop being two places.

  It previews the PREVIEW build, not the live domain, and that is the whole
  point - preview is the deployment with visual editing turned on, and it is
  where unpublished work can be seen. The live domain would show whatever was
  last published, which is the one thing an editor does not need to check.

  A STATIC SITE DOES NOT UPDATE AS YOU TYPE. Cloudflare Pages serves a build,
  so this shows the page as of the last deploy - which is honest about what
  the tool is, and is said on the card rather than left to be discovered. For
  live-as-you-type, run the site locally and point
  SANITY_STUDIO_PREVIEW_URL at it; the Presentation tab's own note in
  sanity.config.ts says the same thing for the same reason.
*/
const PREVIEW_URL =
  (import.meta as any).env?.SANITY_STUDIO_PREVIEW_URL ||
  'https://preview.rumeau-design-co.pages.dev'

/*
  Where a document lives on the site.

  Returns null for anything with no page of its own - a Grid Item is a tile
  on the Portfolio, not a URL - and the view says so rather than showing a
  404 and letting the editor wonder which of the two things is broken.
*/
export function pathFor(doc: any): {path: string; note?: string} | null {
  if (!doc) return null
  const slug = doc?.slug?.current
  if (doc._type === 'caseStudy') {
    if (doc.pageType !== 'Case Study') {
      return {
        path: '/portfolio',
        note: 'A Grid Item has no page of its own - this is the grid it appears in.',
      }
    }
    return slug ? {path: `/work/${slug}`} : null
  }
  if (doc._type === 'blogPost') return slug ? {path: `/blog/${slug}`} : null
  if (doc._type === 'page') return slug ? {path: `/${slug}`} : null
  return null
}

export const PagePreview: UserViewComponent = ({document}) => {
  const doc = (document as any)?.displayed
  const target = pathFor(doc)

  if (!target) {
    return (
      <Card padding={4} tone="caution" height="fill">
        <Stack space={3}>
          <Text weight="semibold">No page to preview yet</Text>
          <Text size={1} muted>
            This document has no slug, so it has no address on the site. Fill in the
            slug on the Tile tab and this will point at it.
          </Text>
        </Stack>
      </Card>
    )
  }

  const url = `${PREVIEW_URL}${target.path}`

  return (
    <Flex direction="column" height="fill">
      <Card padding={2} borderBottom tone="transparent">
        <Flex align="center" gap={2}>
          <Text size={1} muted style={{flex: 1}}>
            {target.note ?? 'Preview build - shows the last deploy, not unsaved edits.'}
          </Text>
          <Button
            as="a"
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            text="Open in a tab"
            mode="ghost"
            fontSize={1}
            padding={2}
          />
        </Flex>
      </Card>
      <iframe
        title="Page preview"
        src={url}
        style={{border: 0, width: '100%', height: '100%', flex: 1, background: '#fff'}}
      />
    </Flex>
  )
}
