import type {DocumentActionComponent, DocumentBadgeComponent} from 'sanity'
import {pathFor} from './components/PagePreview'

/*
  WHAT THE EDITOR CAN SEE AND DO FROM THE DOCUMENT ITSELF.

  Two small things, both answering questions that currently need a trip
  somewhere else to answer.
*/

const LIVE_URL = 'https://rumeaudesign.co'

/*
  "Open the live page" - the published page, deliberately, where the preview
  view beside the form shows the preview build.

  The two are different questions and an editor asks both: the preview answers
  "what will this look like", the live link answers "what are people seeing
  right now". Conflating them is how a page gets fixed in preview and left
  broken in production for a week.

  Hidden where there is nothing to open: a Grid Item has no page, and a
  document with no slug has no address yet.
*/
export const openLiveAction: DocumentActionComponent = (props) => {
  const doc: any = props.published ?? props.draft
  const target = pathFor(doc)
  // Only a real page of its own, and only once it has been published: a link
  // to a URL that 404s is worse than no link.
  if (!target || !props.published || doc?.pageType !== 'Case Study') return null

  return {
    label: 'Open the live page',
    onHandle: () => {
      window.open(`${LIVE_URL}${target.path}`, '_blank', 'noopener,noreferrer')
      props.onComplete()
    },
  }
}

/*
  A PASSWORD BADGE, because a gated page looks exactly like an open one from
  inside the Studio.

  Password protection is a field near the bottom of a collapsed panel now,
  which is right - it is set rarely. The cost of putting a rarely-set field
  out of sight is that a page which IS gated gives no sign of it, and "why
  can nobody see this project" is an expensive question to answer from the
  outside. The badge is the cheap half of that trade.
*/
export const passwordBadge: DocumentBadgeComponent = (props) => {
  const doc: any = props.published ?? props.draft
  if (!doc?.accessPassword) return null
  return {
    label: 'Password protected',
    color: 'warning',
    title: 'Visitors must enter a password to read this page.',
  }
}

/*
  Which of the two jobs a caseStudy document is doing.

  One document type serves both a project page and a portfolio tile, and the
  difference decides which two thirds of the form apply. It is a dropdown on
  the Tile tab; this puts the answer where you can see it without opening
  anything.
*/
export const pageTypeBadge: DocumentBadgeComponent = (props) => {
  const doc: any = props.draft ?? props.published
  if (doc?._type !== 'caseStudy') return null
  return doc?.pageType === 'Case Study'
    ? {label: 'Project page', color: 'primary', title: 'Has a page at /work/…'}
    : {label: 'Grid item', title: 'A tile on the Portfolio, with no page of its own.'}
}
