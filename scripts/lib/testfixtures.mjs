/**
 * Test fixtures that sharp cannot synthesise itself.
 *
 * sharp can read animated images but has no API for creating one, and the
 * animated-source guard in process.mjs is exactly the kind of thing that must
 * be tested against real bytes — it exists to stop the pipeline flattening a
 * pass-through animation into a still, which would be silent and destructive.
 */

/**
 * Build a minimal multi-frame GIF89a.
 *
 * Uses the "uncompressed GIF" trick: with an LZW minimum code size of 7 every
 * code is exactly 8 bits, so codes land on byte boundaries and no real LZW
 * encoder is needed. A clear code is emitted before each run of literals to
 * reset the dictionary before it would ever widen past 8 bits.
 */
export function makeAnimatedGif({ width = 4, height = 4, frames = 3, delay = 10 } = {}) {
  const MIN_CODE_SIZE = 7;
  const CLEAR = 1 << MIN_CODE_SIZE; // 128
  const EOI = CLEAR + 1; // 129
  const MAX_LITERALS = 125; // re-clear before the code width would grow

  const bytes = [];
  const push = (...b) => bytes.push(...b);
  const u16 = (n) => push(n & 0xff, (n >> 8) & 0xff);

  push(...[...'GIF89a'].map((c) => c.charCodeAt(0)));

  // Logical screen descriptor: global colour table present, 128 entries.
  u16(width);
  u16(height);
  push(0x86, 0x00, 0x00);

  // 128-entry palette; only the first few are used, the rest pad it out to the
  // size the descriptor above promises.
  for (let i = 0; i < 128; i++) push((i * 2) & 0xff, (255 - i * 2) & 0xff, (i * 5) & 0xff);

  // Netscape looping extension — what actually marks the file as animated.
  push(0x21, 0xff, 0x0b);
  push(...[...'NETSCAPE2.0'].map((c) => c.charCodeAt(0)));
  push(0x03, 0x01, 0x00, 0x00, 0x00);

  for (let f = 0; f < frames; f++) {
    // Graphic control extension (per-frame delay).
    push(0x21, 0xf9, 0x04, 0x00);
    u16(delay);
    push(0x00, 0x00);

    // Image descriptor: full-frame, no local colour table.
    push(0x2c);
    u16(0); u16(0); u16(width); u16(height);
    push(0x00);

    // Every pixel in this frame gets the frame's own palette index, so the
    // frames visibly differ and a decoder cannot collapse them.
    const index = (f + 1) % 128;
    const pixels = new Array(width * height).fill(index);

    push(MIN_CODE_SIZE);
    const stream = [];
    for (let i = 0; i < pixels.length; i += MAX_LITERALS) {
      stream.push(CLEAR, ...pixels.slice(i, i + MAX_LITERALS));
    }
    stream.push(EOI);

    for (let i = 0; i < stream.length; i += 255) {
      const chunk = stream.slice(i, i + 255);
      push(chunk.length, ...chunk);
    }
    push(0x00); // block terminator
  }

  push(0x3b); // trailer
  return Buffer.from(bytes);
}
