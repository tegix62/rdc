import {defineField, defineType} from 'sanity'
import {imageSpec} from './imageFields'

/*
  SIGHTINGS - Chris's shirts and prints out in the world. He liked the idea,
  "but it'd have to be more accessible to somebody out in the wild, because
  it'd likely just be me taking the pictures." So a sighting needs only a
  photo: his own, or one someone sent or tagged (#rumeauinthewild), added
  here by him - nothing on the site for strangers to upload into, so
  nothing to moderate but what he chooses to add. /next/sightings/wild on
  the preview.
*/
export default defineType({
  name: 'sighting',
  title: 'Sighting',
  type: 'document',
  fields: [
    imageSpec({name: 'photo', title: 'The photo', validation: (Rule: any) => Rule.required()}),
    defineField({
      name: 'piece',
      title: 'Which piece (optional)',
      type: 'reference',
      to: [{type: 'caseStudy'}],
    }),
    defineField({name: 'where', title: 'Where (optional)', type: 'string', description: 'As it reads: "A Gojira show, Denver".'}),
    defineField({name: 'when', title: 'When (optional)', type: 'date'}),
    defineField({
      name: 'by',
      title: 'Photo by (optional)',
      type: 'string',
      description: 'A name or @handle, only with their say-so. Left empty, nobody is named.',
    }),
    defineField({name: 'byLink', title: 'Their link (optional)', type: 'url'}),
  ],
  orderings: [{title: 'Newest', name: 'whenDesc', by: [{field: 'when', direction: 'desc'}]}],
  preview: {
    select: {where: 'where', piece: 'piece.title', when: 'when', media: 'photo'},
    prepare: ({where, piece, when, media}) => ({title: piece || where || 'Sighting', subtitle: [where, when].filter(Boolean).join(' · '), media}),
  },
})
