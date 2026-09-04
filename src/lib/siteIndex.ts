/*
  Grouping the work for the footer index.

  Lifted out of SiteFooter.astro so it can be tested. Nothing on the page ever
  shows whether a project quietly failed to appear in an index - the block just
  looks slightly shorter - which is the same reason lib/meta.ts has a test in
  front of it.
*/

export interface IndexItem {
  title: string;
  slug: string;
}

export interface IndexGroup {
  name: string;
  items: IndexItem[];
}

/*
  Studio's own category order, so the block does not reshuffle itself when a
  project is added or recategorised.
*/
export const CATEGORY_ORDER = [
  'Brand Identity',
  'Merch & Apparel',
  'Typography',
  'Illustration',
  'Photography',
];

/** Where a project with no category goes. An index that drops things is not one. */
export const UNCATEGORISED = 'Other work';

export function groupWorkByCategory(work: unknown): IndexGroup[] {
  if (!Array.isArray(work)) return [];

  const byCategory = new Map<string, IndexItem[]>();
  for (const item of work) {
    // A slug or title missing means the link would be broken or blank, which
    // is worse in an index than an absence.
    if (typeof item?.slug !== 'string' || !item.slug) continue;
    if (typeof item?.title !== 'string' || !item.title) continue;
    const key =
      typeof item.category === 'string' && item.category.trim()
        ? item.category
        : UNCATEGORISED;
    if (!byCategory.has(key)) byCategory.set(key, []);
    byCategory.get(key)!.push({title: item.title, slug: item.slug});
  }

  /*
    Known categories first in Studio's order, then anything else in the order
    it turned up - a category renamed in Studio still appears rather than
    silently taking its projects off the page. UNCATEGORISED sorts to the end
    because it is a fallback, not a category.
  */
  const seen = new Set<string>();
  const names: string[] = [];
  for (const name of [...CATEGORY_ORDER, ...byCategory.keys()]) {
    if (seen.has(name) || !byCategory.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  names.sort((a, b) => Number(a === UNCATEGORISED) - Number(b === UNCATEGORISED));

  return names.map((name) => ({name, items: byCategory.get(name)!}));
}
