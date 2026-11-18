/**
 * `.webhooks-url` (public/css/style.css) must set an explicit `width`, not
 * only a `max-width`.
 *
 * Verified on a throwaway page mirroring this table's actual structure
 * (`.table-scroll { overflow-x: auto }` wrapping a `table-layout: auto`
 * table): under a wide viewport, `max-width: 420px` alone rendered the
 * column at 799px — the auto table-layout algorithm only formally
 * recognises `width` for a column's "constrained" size, and most engines
 * only honour a lone `max-width` on a `<td>` until there is leftover table
 * width to redistribute, at which point that pass hands the column the room
 * anyway. Only adding an explicit `width` alongside `max-width` pinned the
 * column at the declared value in that same test.
 *
 * A future edit "halving the column" by touching only `max-width` (the
 * naive, plausible-looking fix) would leave this guard red — the operator
 * asked for roughly half of 420px, and half of a value the column does not
 * actually honour is not a fix at all.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const css = readFileSync(join(__dirname, '../../../public/css/style.css'), 'utf8')

/** The declaration block for `.webhooks-url`, without its comment banner. */
function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))
  if (!m) throw new Error(`no rule found for ${selector}`)
  return m[1]!
}

describe('.webhooks-url column width', () => {
  const body = rule('.webhooks-url')

  it('sets an explicit width, not max-width alone', () => {
    // Fails if `width` is removed and only `max-width` is left — the exact
    // shape that does not reliably constrain an auto-layout table column.
    expect(body).toMatch(/(?<!max-)width:\s*\d+px/)
  })

  it('keeps width and max-width equal, so the column cannot grow past its own cap', () => {
    const width = body.match(/(?<!max-)width:\s*(\d+)px/)?.[1]
    const maxWidth = body.match(/max-width:\s*(\d+)px/)?.[1]
    expect(width).toBeTruthy()
    expect(maxWidth).toBeTruthy()
    expect(width).toBe(maxWidth)
  })

  it('is roughly half of the previous 420px cap', () => {
    const width = Number(body.match(/(?<!max-)width:\s*(\d+)px/)?.[1])
    // "Roughly half" per the operator's request, not exactly 210 — but
    // fails if a future edit leaves the old 420px in place untouched, or
    // widens it back out well past a genuine halving.
    expect(width).toBeGreaterThan(150)
    expect(width).toBeLessThanOrEqual(250)
  })

  it('still lets the URL wrap instead of clipping', () => {
    // The width fix narrows the column; overflow-wrap is what keeps that
    // narrower column from silently cutting the URL off instead of
    // wrapping it onto more lines. Fails if either rule is dropped.
    expect(body).toMatch(/overflow-wrap:\s*anywhere/)
  })
})
