/*
  The one place the budget slider's numbers live.

  Three things import this: the Astro page (for the input min/max/step
  attributes), the client-side script (for formatting and clamping as the
  handles move), and the test file. Numbers duplicated across those would
  eventually disagree - the slider would let someone drag past what the label
  claims is the ceiling - so there is one export of each and everything reads
  from it.

  Chris's own range, not the $3k-$50k example he was shown: $1,500 is what the
  Tally form's lowest bracket already was, and $6,000 stays the practical
  ceiling with the top of the slider read as "$6,000+" - open-ended, the way
  the Tally buttons had it - rather than inventing a hard number nobody chose.
*/
export const BUDGET_MIN = 1500;
export const BUDGET_MAX = 6000;
export const BUDGET_STEP = 250;

/** $1,500 -> "$1,500". No decimals; every value here is already a whole number of dollars. */
export function formatBudget(value: number): string {
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

/** The top handle's label reads "+" once it reaches the ceiling - see BUDGET_MAX above. */
export function formatBudgetHigh(value: number): string {
  return value >= BUDGET_MAX ? `${formatBudget(value)}+` : formatBudget(value);
}

export interface BudgetRange {
  min: number;
  max: number;
  /** True once the high handle sits at BUDGET_MAX - see formatBudgetHigh. */
  openEnded: boolean;
}

/*
  Keeps the two handles from crossing, and snaps both to BUDGET_STEP.

  Never trust the raw DOM values for this: a fast drag with a keyboard's arrow
  keys, or two fingers on a touchscreen, can move both handles in the same
  frame and land them on either side of each other before either "input" event
  fires. Called from BOTH the browser (clientForm.ts) and the server
  (functions/api/contact.ts) with the same function, so a value the client
  never could have produced does not get treated as though it might have.
*/
export function clampBudgetRange(rawMin: number, rawMax: number): BudgetRange {
  const snap = (n: number) => Math.round(n / BUDGET_STEP) * BUDGET_STEP;
  let min = Math.min(Math.max(snap(rawMin), BUDGET_MIN), BUDGET_MAX);
  let max = Math.min(Math.max(snap(rawMax), BUDGET_MIN), BUDGET_MAX);
  if (min > max) [min, max] = [max, min];
  return { min, max, openEnded: max >= BUDGET_MAX };
}
