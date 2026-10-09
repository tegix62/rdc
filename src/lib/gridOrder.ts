/*
  The order the Portfolio grid is dealt in.

  WHAT IT USED TO DO

  Three tiers, shuffled within each: case studies, then items linked to a
  case study, then everything else. Case studies first was deliberate and
  stays - they are the curated work and they earn the top of the page.

  WHAT WAS WRONG WITH IT

  Shuffling the second tier freely clumps a brand together. Chris: "I don't
  want a hug-a-mug piece adjacent to a hug-a-mug piece." On a grid of eighty
  tiles where a single project can carry a dozen offshoots, random order
  reliably produces runs of four or five from the same project, which reads
  as a folder someone emptied onto the page rather than as a body of work.

  WHAT IT DOES NOW

    1. every case study, shuffled - unchanged, and since there is one case
       study per project they cannot clump with each other by construction
    2. everything else, dealt round-robin across projects, always taking from
       the project with the most left to place, and preferring a project over
       an unaffiliated piece whenever those lengths tie

  Step 2 is the whole idea. Taking from the largest remaining pile is what
  keeps the big projects spread to the end instead of exhausting the small
  ones early and leaving a tail of nothing but Hug a Mug - it is the standard
  answer to "rearrange so no two neighbours match", and it is optimal: if any
  arrangement avoids adjacency, this finds one.

  The tie-break clause is what keeps the bottom of the page for unaffiliated
  work; see the comment at the tie-break itself for why it was needed and
  what it costs.

  WHERE IT CANNOT WIN

  If one project holds more items than every other project combined, some of
  its items MUST touch. That is arithmetic, not a bug, and the function
  reports it through `adjacentPairs` rather than quietly doing its best - a
  number nobody prints is a number nobody checks.

  Pure, and takes its randomness as an argument, so the tests can pin a seed
  and assert an exact order. Same reasoning as fitToRows in queries.ts: the
  only symptom of this being wrong is a grid that feels clumped, and nobody
  opens a bug for a feeling.
*/
import {stripStegaKey as cleanKey} from './stega';

type Tile = {
  slug?: {current?: string} | string;
  pageType?: unknown;
  parentSlug?: string;
  parentType?: unknown;
  _id?: string;
};

export function isCaseStudy(item: Tile): boolean {
  return cleanKey(item?.pageType) === 'Case Study';
}

/*
  Which project a tile belongs to, as a string to group by.

  A case study is its own project. An offshoot belongs to its parent. A tile
  with no parent belongs to nothing - and critically gets a key unique to
  itself rather than a shared "none" bucket, because tiles that merely lack a
  parent are not related to each other and must not be spaced apart as
  though they were. Lumping them together was the first version of this and
  it pushed 44 unrelated pieces into one pile, which then dominated the
  round-robin and starved every real project.
*/
export function projectKey(item: Tile): string {
  if (isCaseStudy(item)) {
    const own = typeof item.slug === 'string' ? item.slug : item.slug?.current;
    return `cs:${cleanKey(own) ?? item._id ?? Math.random()}`;
  }
  if (item?.parentSlug && cleanKey(item.parentType) === 'Case Study') {
    return `cs:${cleanKey(item.parentSlug)}`;
  }
  const own = typeof item.slug === 'string' ? item.slug : item.slug?.current;
  return `solo:${cleanKey(own) ?? item._id ?? String(Math.random())}`;
}

function shuffled<T>(arr: T[], rand: () => number): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export type OrderResult<T> = {
  items: T[];
  /*
    How many neighbouring pairs ended up from the same project. Zero whenever
    zero is achievable; above zero only when one project outnumbers the rest
    and the arithmetic forces it.
  */
  adjacentPairs: number;
  /** The project that forced them, when any were forced. */
  crowdedBy: string | null;
};

export function orderTiles<T extends Tile>(
  items: T[],
  rand: () => number = Math.random,
): OrderResult<T> {
  const caseStudies = shuffled(items.filter(isCaseStudy), rand);
  const others = items.filter((i) => !isCaseStudy(i));

  const piles = new Map<string, T[]>();
  for (const item of shuffled(others, rand)) {
    const key = projectKey(item);
    const pile = piles.get(key);
    if (pile) pile.push(item);
    else piles.set(key, [item]);
  }

  const out: T[] = [...caseStudies];
  // Seeded from the last case study so the first offshoot dealt cannot be
  // one of ITS offshoots - the boundary between the two phases is a pair
  // like any other, and the obvious place to forget one.
  let prev = out.length ? projectKey(out[out.length - 1]) : null;
  let adjacentPairs = 0;
  let crowdedBy: string | null = null;

  const remaining = () => [...piles.entries()].filter(([, v]) => v.length > 0);

  for (;;) {
    const live = remaining();
    if (!live.length) break;

    let pick = live.filter(([k]) => k !== prev);
    // Only this project left. Its next item has to touch the last one.
    if (!pick.length) {
      pick = live;
      adjacentPairs += 1;
      crowdedBy = live[0][0];
    }

    /*
      A PROJECT'S LAST PIECE IS STILL A PROJECT'S PIECE.

      Chris found the Adelante "More Kilos" tee at the very bottom of the
      grid and asked whether the tail was supposed to hold only unaffiliated
      work. It was not written to - and it should be.

      The hole was in the tie-break. Taking from the largest pile drains the
      big projects first, which is the whole anti-clumping idea, but it
      leaves every project pile ending its life at length 1 - and at that
      point it ties with all thirty-eight standalone tiles and gets picked
      with the same probability as any of them. So a project's final piece
      was being shuffled uniformly through the tail and could land dead
      last. Simulated over 400 deals of the live pile shape, it landed at
      position 61 of 82 on average and position 81 at worst.

      Preferring project piles whenever the lengths tie drains every project
      before the standalone block starts: last piece at position 43 at
      worst, and nothing affiliated in the final fifteen tiles across the
      same 400 deals.

      It costs nothing. Both versions produce zero adjacent same-project
      pairs over those deals, because the no-repeat rule above still runs
      first - this only chooses between piles that were already allowed.

      The visible consequence is worth naming: the grid now reads as two
      bands, the projects and their work above, the loose archive below,
      rather than as a gradient. That is a stronger statement than before
      and it is the one Chris described wanting.
    */
    const most = Math.max(...pick.map(([, v]) => v.length));
    const tied = pick.filter(([, v]) => v.length === most);
    const affiliated = tied.filter(([k]) => k.startsWith('cs:'));
    const bag = affiliated.length ? affiliated : tied;
    const [key, pile] = bag[Math.floor(rand() * bag.length)];

    out.push(pile.shift() as T);
    prev = key;
  }

  return {items: out, adjacentPairs, crowdedBy};
}
