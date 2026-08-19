const WORDS_PER_MINUTE = 200;

export function readingTime(blocks: unknown): string | null {
  if (!blocks || !Array.isArray(blocks) || !blocks.length) return null;
  let words = 0;
  for (const block of blocks) {
    if (block._type === 'block' && Array.isArray(block.children)) {
      for (const child of block.children) {
        if (typeof child.text === 'string') {
          words += child.text.split(/\s+/).filter(Boolean).length;
        }
      }
    }
  }
  if (words === 0) return null;
  const minutes = Math.max(1, Math.round(words / WORDS_PER_MINUTE));
  return `${minutes} min read`;
}
