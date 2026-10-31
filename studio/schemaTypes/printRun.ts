import {defineField, defineType} from 'sanity'

/*
  THE REGISTER - one entry per run of merch or prints Chris designed: what,
  for whom, when, how many, how fast it went. Chris: "I sort of see the
  appeal, but we'd have to really work on it, so I would say yes." Shown at
  /next/register/runs on the preview; until there are entries, the page
  lists the merch pieces as DRAFT rows to show the shape.
*/
export default defineType({
  name: 'printRun',
  title: 'Register run',
  type: 'document',
  fields: [
    defineField({
      name: 'piece',
      title: 'The piece',
      type: 'reference',
      to: [{type: 'caseStudy'}],
      description: 'The grid item or project it is. Its picture and title are used.',
    }),
    defineField({
      name: 'title',
      title: 'Name (optional)',
      type: 'string',
      description: "Left empty, the piece's title.",
    }),
    defineField({name: 'client', title: 'For', type: 'string'}),
    defineField({
      name: 'item',
      title: 'What it was',
      type: 'string',
      description: 'As it reads: "Tee, 3-colour screenprint", "Riso poster, 11 x 17".',
    }),
    defineField({name: 'year', title: 'Year', type: 'number', validation: (Rule) => Rule.integer().min(2000).max(2100)}),
    defineField({name: 'edition', title: 'How many were made (optional)', type: 'number', validation: (Rule) => Rule.integer().min(1)}),
    defineField({
      name: 'went',
      title: 'How it went (optional)',
      type: 'string',
      description: 'As it reads: "Sold out in 3 days", "$3,500 first day", "Reprinted twice".',
    }),
    defineField({
      name: 'status',
      title: 'Where it stands',
      type: 'string',
      options: {list: [
        {title: 'Still available', value: 'available'},
        {title: 'Sold out', value: 'soldout'},
        {title: 'Retired', value: 'retired'},
      ], layout: 'radio'},
      initialValue: 'soldout',
    }),
  ],
  orderings: [{title: 'Year', name: 'yearDesc', by: [{field: 'year', direction: 'desc'}]}],
  preview: {
    select: {title: 'title', pieceTitle: 'piece.title', client: 'client', year: 'year', media: 'piece.thumbnail'},
    prepare: ({title, pieceTitle, client, year, media}) => ({
      title: title || pieceTitle || 'Untitled run',
      subtitle: [client, year].filter(Boolean).join(' · '),
      media,
    }),
  },
})
