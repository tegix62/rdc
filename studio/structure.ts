import type {DefaultDocumentNodeResolver, StructureResolver} from 'sanity/structure'
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

const structure: StructureResolver = (S) =>
  S.list()
    .title('Content')
    .items([
      S.listItem()
        .title('Projects')
        .schemaType('caseStudy')
        .child(
          S.documentList()
            .title('Projects')
            .schemaType('caseStudy')
            .filter('_type == "caseStudy" && pageType == "Case Study"')
            .defaultOrdering([{field: 'title', direction: 'asc'}])
            // So "+" here makes a project rather than something that has to
            // be corrected afterwards - see the templates in sanity.config.ts.
            .initialValueTemplates([S.initialValueTemplateItem('caseStudy-project')]),
        ),
      S.listItem()
        .title('Grid Items')
        .schemaType('caseStudy')
        .child(
          S.documentList()
            .title('Grid Items')
            .schemaType('caseStudy')
            .filter('_type == "caseStudy" && pageType != "Case Study"')
            .defaultOrdering([{field: 'title', direction: 'asc'}])
            .initialValueTemplates([S.initialValueTemplateItem('caseStudy-grid-item')]),
        ),
      S.divider(),
      ...S.documentTypeListItems().filter(
        (item) => item.getId() !== 'caseStudy',
      ),
    ])

export default structure
