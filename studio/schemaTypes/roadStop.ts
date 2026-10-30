import {defineField, defineType} from 'sanity'

/*
  A stop on the road - the journey map at /next/road/map (preview only for
  now). Chris: "it's easy for me to discount what I've done and where I've
  been and how I've bettered people's lives and businesses ... since 2019
  ... upon each checkpoint you could see who I met, what they needed, what
  names pop up, what assets pop up that were related to it, what I did. It
  becomes a whole timeline ... year by year."

  One stop per piece of work, written the same way every time. The map
  draws them in order of year (then month), and links the work picked here.
  A business that closed stays on the map, marked as such: the work still
  happened.
*/

const credits = {
  type: 'block',
  styles: [{title: 'Normal', value: 'normal'}],
  lists: [],
  marks: {
    decorators: [{title: 'Bold', value: 'strong'}],
    annotations: [
      {
        name: 'link',
        type: 'object',
        title: 'Link',
        fields: [
          {
            name: 'href',
            type: 'url',
            title: 'URL',
            validation: (Rule: any) => Rule.uri({scheme: ['http', 'https', 'mailto']}).required(),
          },
        ],
      },
    ],
  },
}

export default defineType({
  name: 'roadStop',
  title: 'Road stop',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Who',
      type: 'string',
      description: 'The business, band or person - the name the stop goes by on the map.',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'year',
      title: 'Year it started',
      type: 'number',
      validation: (Rule) => Rule.required().integer().min(2000).max(2100),
    }),
    defineField({
      name: 'month',
      title: 'Month it started (optional)',
      type: 'number',
      description: '1-12. Only orders stops within the same year.',
      validation: (Rule) => Rule.integer().min(1).max(12),
    }),
    defineField({
      name: 'span',
      title: 'How long (optional)',
      type: 'string',
      description: 'As it reads: "Three years", "2019-2022", "One weekend".',
    }),
    defineField({
      name: 'need',
      title: 'What they needed',
      type: 'text',
      rows: 2,
      description: 'One sentence, in their words if you remember them.',
    }),
    defineField({
      name: 'did',
      title: 'What I did',
      type: 'text',
      rows: 4,
      description: 'What you made, and the work that does not show - running the sponsor outreach, setting up how they ordered merch.',
    }),
    defineField({
      name: 'changed',
      title: 'What changed',
      type: 'text',
      rows: 3,
      description: 'Sales, a launch, a sold-out show, a brand still in use, a client who came back.',
    }),
    defineField({
      name: 'status',
      title: 'Where it stands',
      type: 'string',
      options: {
        list: [
          {title: 'Still going', value: 'going'},
          {title: 'Finished - the work was done', value: 'done'},
          {title: 'Closed - the business is gone, the work still happened', value: 'closed'},
        ],
        layout: 'radio',
      },
      initialValue: 'done',
    }),
    defineField({
      name: 'after',
      title: 'What happened after (optional)',
      type: 'text',
      rows: 2,
      description: 'Honestly, including "closed in 2023".',
    }),
    defineField({
      name: 'people',
      title: 'Who was there',
      type: 'array',
      description:
        'One per line, like a project\'s Credits: bold the role, link the name. Sponsors and patrons go here too. Left empty, the map uses the Credits of the work picked below.',
      of: [credits],
    }),
    defineField({
      name: 'work',
      title: 'The work',
      type: 'array',
      description: 'Projects and grid items from this stop. The first few show on the map.',
      of: [{type: 'reference', to: [{type: 'caseStudy'}]}],
    }),
    defineField({
      name: 'landmark',
      title: 'Landmark drawing (optional)',
      type: 'image',
      description: 'Your drawing for this stop on the map. A transparent PNG works best. Left empty, the map shows a plain marker.',
    }),
  ],
  orderings: [
    {
      title: 'Year',
      name: 'yearAsc',
      by: [
        {field: 'year', direction: 'asc'},
        {field: 'month', direction: 'asc'},
      ],
    },
  ],
  preview: {
    select: {title: 'title', year: 'year', status: 'status', media: 'landmark'},
    prepare: ({title, year, status, media}) => ({
      title,
      subtitle: [year, status === 'closed' ? 'closed' : status === 'going' ? 'still going' : null]
        .filter(Boolean)
        .join(' · '),
      media,
    }),
  },
})
