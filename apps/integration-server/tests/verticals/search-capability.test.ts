import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { adapterSupportsSearch, assertSearchSupported } from '@opensteward/shared'

/**
 * Finding 24 — `search` was accepted everywhere and honoured by 54 of 1,547
 * adapters.
 *
 * It is the fourth parameter in this class, after `status`, `offset` and
 * `since`/`updated_after`. Two of those were resolved by removal and one by
 * implementation; removal is wrong here, because `search` is genuinely real
 * for a meaningful slice of the catalogue — 33 of 176 ecommerce adapters and
 * 14 of 115 docsign adapters implement it. Deleting it would destroy a working
 * capability to fix a reporting problem.
 *
 * So support is DECLARED, and an adapter that has not declared it refuses the
 * parameter instead of ignoring it. The silent no-op is the defect, not the
 * partial support.
 *
 * I introduced the reporting half of this: `search` was added to the MCP tool
 * surface in the previous round because the router parsed it, without checking
 * that adapters acted on it. Parsing a parameter is not implementing it.
 */

const VERTICALS_DIR = join(__dirname, '../../src/verticals')
const VERTICALS = readdirSync(VERTICALS_DIR).filter(
  (d) => d !== 'shared' && existsSync(join(VERTICALS_DIR, d, 'adapters')),
)

interface AdapterFile {
  vertical: string
  slug: string
  src: string
}

function adapterFiles(): AdapterFile[] {
  const out: AdapterFile[] = []
  for (const vertical of VERTICALS) {
    const dir = join(VERTICALS_DIR, vertical, 'adapters')
    for (const slug of readdirSync(dir)) {
      const index = join(dir, slug, 'index.ts')
      if (existsSync(index)) out.push({ vertical, slug, src: readFileSync(index, 'utf8') })
    }
  }
  return out
}

const ADAPTERS = adapterFiles()
const USES_SEARCH = ADAPTERS.filter((a) => /\bparams\.search\b/.test(a.src))
const DECLARES_SEARCH = ADAPTERS.filter((a) => /capabilities\s*=\s*\{[^}]*search:\s*true/.test(a.src))

describe('the search capability declaration matches reality', () => {
  it('discovers the adapter catalogue', () => {
    // Guards the guard — a broken glob would make every assertion vacuous.
    expect(ADAPTERS.length).toBeGreaterThan(1000)
    expect(USES_SEARCH.length).toBeGreaterThan(20)
  })

  it('every adapter that reads params.search declares the capability', () => {
    const undeclared = USES_SEARCH.filter(
      (a) => !/capabilities\s*=\s*\{[^}]*search:\s*true/.test(a.src),
    ).map((a) => `${a.vertical}/${a.slug}`)
    expect(undeclared).toEqual([])
  })

  it('every adapter that declares the capability actually reads params.search', () => {
    // The declaration must not rot into a claim nobody honours — that would
    // recreate the silent no-op with extra steps.
    const unimplemented = DECLARES_SEARCH.filter((a) => !/\bparams\.search\b/.test(a.src)).map(
      (a) => `${a.vertical}/${a.slug}`,
    )
    expect(unimplemented).toEqual([])
  })
})

describe('an undeclared adapter refuses search rather than ignoring it', () => {
  const withSearch = { platform: 'shopify', version: '1', capabilities: { search: true } }
  const without = { platform: 'xero', version: '1' }

  it('recognises a declared adapter', () => {
    expect(adapterSupportsSearch(withSearch)).toBe(true)
  })

  it('recognises an undeclared adapter', () => {
    expect(adapterSupportsSearch(without)).toBe(false)
  })

  it('does nothing when the caller passed no search term', () => {
    expect(() => assertSearchSupported(without, {})).not.toThrow()
    expect(() => assertSearchSupported(without, { search: undefined })).not.toThrow()
    expect(() => assertSearchSupported(without, { search: '' })).not.toThrow()
  })

  it('throws a typed 400 when search is passed to an adapter that cannot honour it', () => {
    let thrown: unknown
    try {
      assertSearchSupported(without, { search: 'Inventory' })
    } catch (err) {
      thrown = err
    }
    expect((thrown as { statusCode?: number }).statusCode).toBe(400)
    expect((thrown as { code?: string }).code).toBe('SEARCH_UNSUPPORTED')
  })

  it('names the platform so the caller knows which connection cannot do it', () => {
    try {
      assertSearchSupported(without, { search: 'Inventory' })
      throw new Error('should have thrown')
    } catch (err) {
      expect((err as Error).message).toContain('xero')
    }
  })

  it('lets a declared adapter through', () => {
    expect(() => assertSearchSupported(withSearch, { search: 'Inventory' })).not.toThrow()
  })
})
