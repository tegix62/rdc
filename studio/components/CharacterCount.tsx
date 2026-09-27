import {Flex, Text} from '@sanity/ui'
import type {StringInputProps, TextInputProps} from 'sanity'

/*
  HOW LONG IS THIS, AND HOW LONG SHOULD IT BE.

  Chris asked for "a character limit to aim for as a suggestion in the Sanity
  user interface". Sanity's own validation can enforce a ceiling and say so
  when you cross it, which is a different thing: it tells you after the fact
  that you have gone too far, and says nothing at all while you are writing.

  This is the part that was missing - a count as you type, next to a target,
  so the guidance arrives when it can still change what you write.

  The target is a soft one and reads as one. Over it, the number goes amber
  rather than red and nothing is blocked: these are search descriptions, and
  Google trimming a line is a shrug, not an error. The validation warning on
  the field stays as the backstop for the genuinely long.

  Written as a wrapper around renderDefault rather than as an input of its
  own, so the field keeps every behaviour it already has - focus, presence,
  validation markers, undo - and gains one line underneath.
*/
export function characterCount(target: number) {
  return function CharacterCount(props: StringInputProps | TextInputProps) {
    const length = (props.value ?? '').length
    const over = length > target

    return (
      <div>
        {props.renderDefault(props as any)}
        <Flex justify="space-between" paddingTop={2}>
          <Text size={1} muted>
            {length === 0 ? `aim for about ${target} characters` : `${length} characters`}
          </Text>
          {over ? (
            <Text size={1} style={{color: 'var(--card-badge-caution-fg-color)'}}>
              over {target} - Google will trim it
            </Text>
          ) : null}
        </Flex>
      </div>
    )
  }
}

/** 150 is roughly what a search result renders before cutting. */
export const SearchLengthInput = characterCount(150)
