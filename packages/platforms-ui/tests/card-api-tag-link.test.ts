/**
 * `cardFor` — the card's "API" link deep-links into the Unified API.
 *
 * Swagger UI's `#tag/<name>` fragment only opens a tag group when `<name>` is
 * exactly a `tags[].name` in the spec. The card used to build it from the
 * vertical's display label, which differs from the tag for two verticals
 * ("E-signature" vs `Docsign`, "Customer Support" vs `CustomerSupport`), so
 * every Docsign and Customer Support card opened the reference with nothing
 * selected.
 *
 * This checks the rendered href against the generated spec rather than a
 * hand-written list, so renaming a tag in the generator fails here instead of
 * silently breaking 100-odd links again. The verticals come from the
 * generated catalogue the page actually renders, so a new vertical is covered
 * the day it ships.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { renderGrid } from './helpers/render-grid.js'
import { VERTICAL_OPENAPI_TAG, type PlatformEntry } from '../src/index.js'

const DOCS = join(__dirname, '../../../docs')
const specTags = new Set<string>(
  (JSON.parse(readFileSync(join(DOCS, 'openapi/openapi.json'), 'utf8')) as {
    tags: Array<{ name: string }>
  }).tags.map((t) => t.name),
)
const catalogueVerticals = Object.keys(
  (JSON.parse(readFileSync(join(DOCS, 'platforms/platforms.json'), 'utf8')) as {
    counts: Record<string, number>
  }).counts,
)

const API_TAG_BASE = '/unified-api#tag/'

/** The fragment of each card's "API" link, in card order. */
function apiTags(html: string): string[] {
  const prefix = API_TAG_BASE.replace(/[#/]/g, (c) => '\\' + c)
  return [...html.matchAll(new RegExp(`<a href="${prefix}([^"]*)">API</a>`, 'g'))].map((m) =>
    decodeURIComponent(m[1]),
  )
}

describe('provider card: API link', () => {
  it('reads nine verticals from the generated catalogue and spec', () => {
    // Guards the two inputs below: an empty set would make every check pass.
    expect(catalogueVerticals).toHaveLength(9)
    expect(specTags.size).toBeGreaterThan(9)
  })

  it.each(catalogueVerticals)('links a %s card to a tag that exists in the spec', async (vertical) => {
    const card: PlatformEntry = { vertical: vertical as PlatformEntry['vertical'], slug: 'x', name: 'X' }
    const tags = apiTags(await renderGrid([card], { apiTagBase: API_TAG_BASE }))
    expect(tags).toHaveLength(1)
    expect([...specTags]).toContain(tags[0])
  })

  it.each([
    ['docsign', 'Docsign', 'E-signature'],
    ['customer-support', 'CustomerSupport', 'Customer Support'],
  ] as const)(
    'links %s to the %s tag while the chip keeps its label',
    async (vertical, tag, label) => {
      const html = await renderGrid([{ vertical, slug: 'x', name: 'X' }], { apiTagBase: API_TAG_BASE })
      expect(apiTags(html)).toEqual([tag])
      expect(html).toContain(`<span class="chip">${label}</span>`)
    },
  )

  it('maps every vertical in the exported table to a spec tag', () => {
    for (const [vertical, tag] of Object.entries(VERTICAL_OPENAPI_TAG)) {
      expect(specTags.has(tag), `${vertical} → ${tag}`).toBe(true)
    }
    expect(Object.keys(VERTICAL_OPENAPI_TAG).sort()).toEqual([...catalogueVerticals].sort())
  })

  it('renders no API link when no tag base is configured', async () => {
    // The admin mounts the catalogue without `apiTagBase`.
    const html = await renderGrid([{ vertical: 'docsign', slug: 'x', name: 'X' }])
    expect(html).not.toContain('>API</a>')
  })
})
