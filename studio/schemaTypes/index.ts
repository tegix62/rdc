import tag from './tag'
import page from './page'
import caseStudy from './caseStudy'
import blogPost from './blogPost'
import siteSettings from './siteSettings'
import contactForm from './contactForm'
import submission from './submission'
import formFunnel from './formFunnel'
import {caseStudySectionTypes} from './caseStudySections'

export const schemaTypes = [
  siteSettings,
  contactForm,
  page,
  caseStudy,
  blogPost,
  tag,
  submission,
  formFunnel,
  ...caseStudySectionTypes,
]
