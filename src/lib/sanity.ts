import {createClient} from '@sanity/client'

export const sanityClient = createClient({
  projectId: '8337vjtf',
  dataset: 'production',
  apiVersion: '2024-01-01',
  useCdn: true,
})
