/*
  RSS 2.0 feed for blog posts.

  Doubles as a podcast feed when posts carry audio narrations: each
  narrated post gets an <enclosure> pointing at the Sanity-hosted audio
  file, which is all a podcast app needs to list and play an episode.

  Discoverable via <link rel="alternate" type="application/rss+xml"> in
  the <head>, added in Layout.astro.
*/
import type { APIRoute } from 'astro';
import { sanityClient } from '../lib/sanity';
import { socialCardUrl, fileUrl } from '../lib/image';

const xmlEscape = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

export const GET: APIRoute = async ({ site }) => {
  const origin = (site?.href ?? 'https://rumeaudesign.co').replace(/\/$/, '');

  const settings = await sanityClient.fetch(
    `*[_type == "siteSettings"][0]{siteTitle, logo, socialImage}`,
  );

  const posts = await sanityClient.fetch<Record<string, any>[]>(
    `*[_type == "blogPost" && defined(slug.current)]
      | order(publishedAt desc)[0...50]{
        title,
        "slug": slug.current,
        publishedAt,
        excerpt,
        metaDescription,
        author,
        category,
        mainImage,
        thumbnailImage,
        audioNarration
      }`,
  );

  const siteTitle = settings?.siteTitle || 'Rumeau Design Co';
  const feedImage = socialCardUrl(settings?.socialImage) ??
    socialCardUrl(settings?.logo) ?? '';

  const hasAudio = posts.some((p) => fileUrl(p.audioNarration));

  const items = posts
    .map((post) => {
      const link = `${origin}/blog/${post.slug}`;
      const description = post.metaDescription || post.excerpt || '';
      const pubDate = post.publishedAt
        ? new Date(post.publishedAt).toUTCString()
        : undefined;
      const image = socialCardUrl(post.mainImage) ??
        socialCardUrl(post.thumbnailImage);
      const audioUrl = fileUrl(post.audioNarration);

      const parts = [
        '    <item>',
        `      <title>${xmlEscape(post.title)}</title>`,
        `      <link>${xmlEscape(link)}</link>`,
        `      <guid isPermaLink="true">${xmlEscape(link)}</guid>`,
      ];

      if (description) {
        parts.push(`      <description>${xmlEscape(description)}</description>`);
      }
      if (pubDate) {
        parts.push(`      <pubDate>${pubDate}</pubDate>`);
      }
      if (post.author) {
        parts.push(`      <dc:creator>${xmlEscape(post.author)}</dc:creator>`);
      }
      if (post.category) {
        parts.push(`      <category>${xmlEscape(post.category)}</category>`);
      }
      if (image) {
        parts.push(
          '      <media:content',
          `        url="${xmlEscape(image)}"`,
          '        medium="image"',
          '        type="image/jpeg"',
          '        width="1200"',
          '        height="630" />',
        );
      }
      if (audioUrl) {
        parts.push(
          `      <enclosure url="${xmlEscape(audioUrl)}" type="audio/mpeg" />`,
        );
        parts.push(
          `      <itunes:summary>${xmlEscape(description)}</itunes:summary>`,
        );
      }
      parts.push('    </item>');
      return parts.join('\n');
    })
    .join('\n');

  const itunesBlock = hasAudio
    ? [
        `    <itunes:author>${xmlEscape(siteTitle)}</itunes:author>`,
        `    <itunes:summary>${xmlEscape('Notes on heritage brand identity, hand lettering, merch design, and the process behind the work.')}</itunes:summary>`,
        '    <itunes:explicit>false</itunes:explicit>',
        '    <itunes:category text="Arts">',
        '      <itunes:category text="Design" />',
        '    </itunes:category>',
        feedImage ? `    <itunes:image href="${xmlEscape(feedImage)}" />` : '',
      ]
        .filter(Boolean)
        .join('\n')
    : '';

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
     xmlns:dc="http://purl.org/dc/elements/1.1/"
     xmlns:media="http://search.yahoo.com/mrss/"
     xmlns:atom="http://www.w3.org/2005/Atom"${hasAudio ? '\n     xmlns:itunes="http://www.itunes.apple.com/dtds/podcast-1.0.dtd"' : ''}>
  <channel>
    <title>${xmlEscape(siteTitle)}</title>
    <link>${origin}</link>
    <description>Notes on heritage brand identity, hand lettering, merch design, and the process behind the work at ${xmlEscape(siteTitle)}.</description>
    <language>en-us</language>
    <atom:link href="${origin}/rss.xml" rel="self" type="application/rss+xml" />
${feedImage ? `    <image>\n      <url>${xmlEscape(feedImage)}</url>\n      <title>${xmlEscape(siteTitle)}</title>\n      <link>${origin}</link>\n    </image>` : ''}
${itunesBlock}
${items}
  </channel>
</rss>
`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
  });
};
