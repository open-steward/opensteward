/**
 * The "Needs attention" rows stack on a phone without a fixed height.
 *
 * On a wide viewport `.tasks__main` takes `flex: 1 1 320px`: a 320px basis
 * on the row's horizontal axis, which is what lets the text block and the
 * action cluster share one line. Once the ≤520px media query turns the row
 * into a column, that same basis applies to the VERTICAL axis and every text
 * block becomes 320px tall — measured in Chromium at 400px, four rows filled
 * ~1,540px of empty space. The narrow block must reset the basis, and this
 * test reads the stylesheet rather than trusting anyone to remember why.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const css = readFileSync(join(__dirname, '../../../public/css/style.css'), 'utf8')

/** The declarations of `selector` inside the ≤520px media block, if any. */
function narrowRule(selector: string): string | null {
  const block = css.match(/@media \(max-width: 520px\) \{([\s\S]*?)\n\}/)
  if (!block) return null
  const body = block[1]!.replace(/\/\*[\s\S]*?\*\//g, '')
  const rules = [...body.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  const hit = rules.find((m) => m[1]!.split(',').some((s) => s.trim() === selector))
  return hit ? hit[2]! : null
}

describe('the ≤520px task-row stack', () => {
  it('turns the row into a column', () => {
    expect(narrowRule('.tasks__row')).toContain('flex-direction: column')
  })

  it('resets the text block’s flex-basis, which would otherwise become its height', () => {
    expect(css).toMatch(/\.tasks__main \{[^}]*flex: 1 1 320px/)
    const narrow = narrowRule('.tasks__main')
    expect(narrow).not.toBeNull()
    expect(narrow).toContain('flex-basis: auto')
    expect(narrow).toContain('width: 100%')
  })
})
