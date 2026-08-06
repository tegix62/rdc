import {useCallback} from 'react'
import {set, useFormValue, type StringInputProps} from 'sanity'

/*
  A live preview for the "Print mode treatment" field.

  Choosing a threshold from a radio list means guessing. The whole reason the
  field exists is that thresholding destroys some images and transforms others,
  and which is which is not something a label can tell you - a hard cut turns
  line art into something better than the original and a photograph into mush.
  With ~120 images to decide about, the choice has to be visible.

  So this renders the actual asset four times, once under each treatment, and
  you pick the one that looks right.

  THE FILTERS MUST MATCH THE SITE EXACTLY or this is worse than no preview at
  all - a preview that lies is a decision made wrongly with confidence. They are
  taken from src/styles/global.css:

    :root[data-ink] img { filter: grayscale(1) brightness(var(--ink-bright))
                                  contrast(var(--ink-contrast));
                          mix-blend-mode: multiply; }

  with --ink-contrast / --ink-bright overridden per mode, and `skip` opting out
  of the filter entirely. If those values change, change them here in the same
  commit. There is no way to import a CSS custom property into React, so this is
  duplication that has to be maintained by hand - hence the comment rather than
  a cleverer arrangement that would hide it.
*/

const PROJECT_ID = '8337vjtf'
const DATASET = 'production'

/* Paper the previews sit on. Bone rather than white, because multiply over a
   tinted stock is what the site actually does and white would flatter the
   result. */
const PAPER = '#f4efe3'

type Mode = 'auto' | 'soft' | 'hard' | 'skip'

const MODES: {value: Mode; title: string; hint: string; filter: string}[] = [
  {
    value: 'auto',
    title: 'Auto',
    hint: 'Strong black and white work',
    filter: 'grayscale(1) brightness(108%) contrast(260%)',
  },
  {
    value: 'soft',
    title: 'Soft',
    hint: 'Photography, anything low contrast',
    filter: 'grayscale(1) brightness(102%) contrast(125%)',
  },
  {
    value: 'hard',
    title: 'Hard',
    hint: 'Line art, near 1-bit',
    filter: 'grayscale(1) brightness(112%) contrast(900%)',
  },
  {value: 'skip', title: 'Skip', hint: 'Stays in colour', filter: 'none'},
]

/*
  Built straight from the asset reference rather than through @sanity/image-url.
  The reference already carries the dimensions and extension, this needs one
  small square, and it avoids pulling a second image library into the Studio
  bundle for a thumbnail.

  Reference shape: image-<assetId>-<width>x<height>-<ext>
*/
function thumbFrom(ref: unknown): string | null {
  if (typeof ref !== 'string') return null
  const match = ref.match(/^image-([a-zA-Z0-9_-]+)-(\d+x\d+)-([a-z0-9]+)$/i)
  if (!match) return null
  const [, id, dimensions, ext] = match
  return (
    `https://cdn.sanity.io/images/${PROJECT_ID}/${DATASET}/${id}-${dimensions}.${ext}` +
    `?w=220&h=220&fit=crop&auto=format`
  )
}

export function InkModePreview(props: StringInputProps) {
  const {value, onChange, renderDefault} = props

  /*
    The image this field belongs to. props.path is something like
    ['thumbnail', 'inkMode'], so dropping the last segment addresses the image
    object itself and gives access to its asset.
  */
  const parent = useFormValue(props.path.slice(0, -1)) as
    | {asset?: {_ref?: string}}
    | undefined
  const thumb = thumbFrom(parent?.asset?._ref)

  const choose = useCallback((mode: Mode) => onChange(set(mode)), [onChange])

  // No image chosen yet, so there is nothing to preview. The normal radio list
  // is still the right control - better than an empty row of grey squares.
  if (!thumb) return renderDefault(props)

  const current = (value as Mode) ?? 'auto'

  return (
    <div style={{display: 'flex', gap: 8, flexWrap: 'wrap'}}>
      {MODES.map((mode) => {
        const selected = current === mode.value
        return (
          <button
            key={mode.value}
            type="button"
            onClick={() => choose(mode.value)}
            aria-pressed={selected}
            title={mode.hint}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              padding: 4,
              cursor: 'pointer',
              background: selected ? '#101112' : 'transparent',
              // A 2px border on every state, transparent when unselected, so
              // selecting does not resize the button and shuffle the row.
              border: `2px solid ${selected ? '#101112' : 'transparent'}`,
              borderRadius: 3,
              color: selected ? '#fff' : 'inherit',
            }}
          >
            <span
              style={{
                display: 'block',
                width: 92,
                height: 92,
                // multiply over the paper is the other half of the site's
                // treatment; filter alone would not show what you will get.
                background: PAPER,
              }}
            >
              <img
                src={thumb}
                alt=""
                width={92}
                height={92}
                style={{
                  display: 'block',
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  filter: mode.filter,
                  mixBlendMode: mode.value === 'skip' ? 'normal' : 'multiply',
                }}
              />
            </span>
            <span style={{fontSize: 11, fontWeight: 600, letterSpacing: '0.02em'}}>
              {mode.title}
            </span>
          </button>
        )
      })}
    </div>
  )
}
