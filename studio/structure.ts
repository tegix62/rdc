import type {DefaultDocumentNodeResolver, StructureResolver} from 'sanity/structure'
import {orderableDocumentListDeskItem} from '@sanity/orderable-document-list'
import {PagePreview} from './components/PagePreview'

/*
  THE PAGE BESIDE THE FORM.

  Every document that has an address on the site gets a second view next to
  its form, showing that page. See components/PagePreview.tsx for what it
  previews and why it is the preview build rather than the live domain.

  Only for types that have a page: a siteSettings document is not a URL, and
  a tab offering to preview one is a tab that can only disappoint.
*/
export const defaultDocumentNode: DefaultDocumentNodeResolver = (S, {schemaType}) => {
  if (!['caseStudy', 'blogPost', 'page'].includes(schemaType)) return S.document()
  return S.document().views([
    S.view.form().title('Edit'),
    S.view.component(PagePreview).title('Page').id('page-preview'),
  ])
}

const structure: StructureResolver = (S, context) =>
  S.list()
    .title('Content')
    .items([
      /*
        Drag to order: the order here is the order the site shows the case
        studies in (the hidden orderRank field - see caseStudy.ts). Chris:
        "make the case studies draggable so that I could order them
        according to the way that I want them to be seen".
      */
      orderableDocumentListDeskItem({
        type: 'caseStudy',
        title: 'Projects',
        id: 'projects-ordered',
        filter: 'pageType == "Case Study"',
        S,
        context,
      }),
      S.listItem()
        .title('Grid Items')
        .schemaType('caseStudy')
        .child(
          S.documentList()
            .title('Grid Items')
            .schemaType('caseStudy')
            .filter('_type == "caseStudy" && pageType != "Case Study" && !(category == "Sketch")')
            .defaultOrdering([{field: 'title', direction: 'asc'}])
            .initialValueTemplates([S.initialValueTemplateItem('caseStudy-grid-item')]),
        ),
      /*
        The sketches, on their own: kept off the site for now (see the
        Category field in caseStudy.ts). New ones are filed as sketches
        already - drop the picture in, give it a title, and pick what it is
        a sketch of under Parent Brand.
      */
      S.listItem()
        .title('Sketches')
        .schemaType('caseStudy')
        .child(
          S.documentList()
            .title('Sketches')
            .schemaType('caseStudy')
            .filter('_type == "caseStudy" && category == "Sketch"')
            .defaultOrdering([{field: 'title', direction: 'asc'}])
            .initialValueTemplates([S.initialValueTemplateItem('caseStudy-sketch')]),
        ),
      S.divider(),
      ...S.documentTypeListItems().filter(
        (item) => item.getId() !== 'caseStudy',
      ),
    ])

export default structure
