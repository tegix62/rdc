import type {StructureResolver} from 'sanity/structure'

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
            .defaultOrdering([{field: 'title', direction: 'asc'}]),
        ),
      S.listItem()
        .title('Grid Items')
        .schemaType('caseStudy')
        .child(
          S.documentList()
            .title('Grid Items')
            .schemaType('caseStudy')
            .filter('_type == "caseStudy" && pageType != "Case Study"')
            .defaultOrdering([{field: 'title', direction: 'asc'}]),
        ),
      S.divider(),
      ...S.documentTypeListItems().filter(
        (item) => item.getId() !== 'caseStudy',
      ),
    ])

export default structure
