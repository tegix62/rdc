import tag from './tag'
import page from './page'
import caseStudy from './caseStudy'
import blogPost from './blogPost'
import siteSettings from './siteSettings'
import {caseStudySectionTypes} from './caseStudySections'

export const schemaTypes = [
  siteSettings,
  page,
  caseStudy,
  blogPost,
  tag,
  ...caseStudySectionTypes,
]
