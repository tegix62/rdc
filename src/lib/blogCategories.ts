/*
  The blog's categories, and the one place that turns a name into a URL.

  This lived inside getStaticPaths in blog/category/[category].astro, which was
  fine while that page was the only thing that needed it. The footer index now
  links these too, and a second copy of a slug rule is how one of them
  eventually disagrees with the other and starts emitting 404s - the same shape
  as the three copies of stripStega and the two copies of the grid's column
  count that this codebase has already been bitten by.

  The descriptions come with the names because they are what the category page
  puts in its <title> and meta description; nothing else reads them.
*/

export interface BlogCategory {
  title: string;
  description: string;
}

export const BLOG_CATEGORIES: Record<string, BlogCategory> = {
  'Brand Identity': {
    title: 'Brand Identity',
    description:
      'Notes on building visual identities — from first sketch to final delivery. Logo design, brand systems, and the thinking behind the marks.',
  },
  'Merch & Apparel': {
    title: 'Merch & Apparel',
    description:
      'Designing for fabric, not just screens. Merch runs, apparel lines, and the production details that make printed work hold up.',
  },
  Typography: {
    title: 'Typography',
    description:
      'Hand lettering, type design, and vintage typography research. The craft behind the characters.',
  },
  Illustration: {
    title: 'Illustration',
    description:
      'Hand-drawn work — from spot illustrations to full compositions. Process, tools, and finished pieces.',
  },
  Process: {
    title: 'Process',
    description:
      'How the work gets made. Studio workflow, client collaboration, and lessons from real projects.',
  },
};

/*
  "Merch & Apparel" -> "merch-apparel".

  The ampersand is collapsed WITH the spaces around it rather than replaced
  separately, so the name does not become "merch---apparel".
*/
export function categorySlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s*&\s*/g, '-')
    .replace(/\s+/g, '-');
}
