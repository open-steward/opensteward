/**
 * The "safe default" preset for a dev API key silently stopped covering half
 * the platform.
 *
 * SAFE_DEFAULT_SCOPES on the server lists all nine verticals, but each view
 * carried a hand-copied duplicate of it in client-side JS — commented "kept in
 * sync manually" — and those copies stopped at four: accounting, crm,
 * ecommerce, logistics. The checkbox grid listed five, adding payments. So the
 * preset a developer was shown did not match the key they were minted, and an
 * operator who switched to Custom got the stale four pre-checked with four
 * verticals absent from the grid entirely — unselectable.
 *
 * These pin the two properties that keep the preset honest: it covers every
 * vertical, and it is derived rather than transcribed.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { SAFE_DEFAULT_SCOPES } from '../../../src/core/routes/api-keys-defaults.js'
import { KNOWN_VERTICALS } from '../../../src/core/verticals.js'

describe('SAFE_DEFAULT_SCOPES', () => {
  it('covers every vertical the platform serves', () => {
    const missing = KNOWN_VERTICALS.filter((v) => !SAFE_DEFAULT_SCOPES.includes(`vertical:${v}`))
    expect(missing).toEqual([])
  })

  it('still withholds vertical:write, which the operator must opt into', () => {
    expect(SAFE_DEFAULT_SCOPES).not.toContain('vertical:write')
  })

  it('grants cross-vertical reads', () => {
    expect(SAFE_DEFAULT_SCOPES).toContain('vertical:read')
  })
})

/**
 * The vertical list is declared once — hand-maintained copies across routes,
 * proxies, and inline view JS drift, and a copy that cannot drift is the only
 * guard that holds.
 */
describe('vertical list is declared once', () => {
  function sourceFiles(dir: string, acc: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) sourceFiles(full, acc)
      else if (/\.(ts|ejs)$/.test(entry)) acc.push(full)
    }
    return acc
  }

  it('is not re-listed anywhere else in the admin app', () => {
    const root = join(__dirname, '../../../src')
    const views = join(__dirname, '../../../views')
    const canonical = join(root, 'core/verticals.ts')
    // A file re-listing three or more vertical names in sequence is keeping
    // its own copy of the list.
    const signature = /'accounting',\s*\n?\s*'crm',\s*\n?\s*'ecommerce'/
    const offenders = [...sourceFiles(root), ...sourceFiles(views)]
      .filter((f) => f !== canonical)
      .filter((f) => signature.test(readFileSync(f, 'utf8')))
      .map((f) => f.replace(join(__dirname, '../../../'), ''))
    expect(offenders).toEqual([])
  })
})
