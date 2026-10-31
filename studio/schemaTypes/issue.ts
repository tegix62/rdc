import {defineField, defineType} from 'sanity'
import {imageSpec} from './imageFields'

/*
  AN ISSUE - once a season the homepage becomes an issue: a cover, a short
  note, the new work. Chris: "Seasonal issues is a good idea. It would take
  a lot of effort, though." So an issue asks for as little as it can: a
  number, a season, a cover and a few lines; the work is picked, not
  written up. The newest is shown at /next/issue/latest on the preview,
  with the older ones under it.
*/
export default defineType({
  name: 'issue',
  title: 'Issue',
  type: 'document',
  fields: [
    defineField({name: 'number', title: 'Issue number', type: 'number', validation: (Rule) => Rule.required().integer().min(1)}),
    defineField({name: 'season', title: 'Season', type: 'string', description: 'As it reads: "Winter 2026".'}),
    imageSpec({name: 'cover', title: 'Cover', description: 'Yours - drawn, collaged, photographed. Portrait works best.'}),
    defineField({name: 'note', title: 'A few lines', type: 'text', rows: 5}),
    defineField({
      name: 'work',
      title: 'The work in this issue',
      type: 'array',
      of: [{type: 'reference', to: [{type: 'caseStudy'}]}],
    }),
    defineField({name: 'date', title: 'Out on', type: 'date'}),
  ],
  orderings: [{title: 'Newest', name: 'numberDesc', by: [{field: 'number', direction: 'desc'}]}],
  preview: {
    select: {number: 'number', season: 'season', media: 'cover'},
    prepare: ({number, season, media}) => ({title: `Issue ${number ?? '?'}`, subtitle: season, media}),
  },
})
