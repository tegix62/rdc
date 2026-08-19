import {defineField, defineType} from 'sanity'
import {imageSpec} from './imageFields'

export default defineType({
  name: 'blogPost',
  title: 'Blog Post',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'slug',
      type: 'slug',
      options: {source: 'title'},
      validation: (Rule) => Rule.required(),
    }),
    defineField({name: 'author', type: 'string'}),
    defineField({name: 'publishedAt', title: 'Date published', type: 'datetime'}),
    defineField({
      name: 'category',
      title: 'Category',
      type: 'string',
      options: {
        list: [
          {title: 'Brand Identity', value: 'brand-identity'},
          {title: 'Lettering', value: 'lettering'},
          {title: 'Process', value: 'process'},
          {title: 'Merch & Apparel', value: 'merch-apparel'},
        ],
      },
    }),
    /*
      Two images, and the difference is which page they appear on - which is now
      what they are called. "Main Image" and "Thumbnail Image" were near enough
      identical to be a coin toss.
    */
    imageSpec({
      name: 'thumbnailImage',
      title: 'Card image - the /blog index',
      description: 'Shown on the blog index. Falls back to the header image below.',
    }),
    imageSpec({
      name: 'mainImage',
      title: 'Header image - top of the post itself',
      description: 'Also used for the social share card when this post is linked.',
    }),
    /*
      Both of these are "a short description of the post", which is why they
      needed telling apart by where they surface rather than by wording.
    */
    defineField({
      name: 'excerpt',
      title: 'Excerpt - shown under the title on /blog',
      type: 'text',
      rows: 3,
    }),
    defineField({
      name: 'metaDescription',
      title: 'Search & social description - not shown on the site',
      type: 'string',
      description:
        'What Google and a shared link display. Falls back to the excerpt ' +
        'above when empty, so only fill this in when the two should differ.',
    }),
    defineField({
      name: 'body',
      title: 'Post',
      type: 'array',
      of: [{type: 'block'}, imageSpec()],
    }),
  ],
  /*
    Three fields removed here, all confirmed read by nothing in src/:

      featured  a boolean set on all 5 posts
      color     set on 1
      length    "Read Length", set on 2

    Two of them - `color` and `length` - were invisible to the automated CMS
    audit, because it decides "is this read?" by grepping src/ for the field
    name and those names appear everywhere for unrelated reasons (CSS colour,
    Array.length). Found by hand instead. Worth knowing that blind spot exists.

    Stored values are cleared by studio/migration/unset-dead-fields.mjs, so
    Studio does not start reporting them as unknown fields on documents that
    still carry them.
  */
  preview: {
    select: {title: 'title', subtitle: 'author', media: 'thumbnailImage'},
  },
})
