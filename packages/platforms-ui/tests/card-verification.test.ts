/**
 * `cardFor` — verification-tier chip rendering, exercised through the shared
 * harness in `tests/helpers/render-grid.ts` (which runs the real client-side
 * script `renderPlatformsBody()` embeds, so these assert on the markup a
 * browser would actually show).
 *
 * The behaviour worth protecting here is what is NOT rendered. Nearly the whole
 * catalog is unverified, so an absent tier must produce no chip at all — a
 * "Scaffolded" badge on 1,544 of 1,545 cards would be noise, and a chip
 * rendered for a tier nobody recognises would be a claim we cannot account for.
 */
import { describe, expect, it } from 'vitest'
import { renderGrid } from './helpers/render-grid.js'
import { type PlatformEntry } from '../src/index.js'

const base: PlatformEntry = {
  vertical: 'logistics',
  slug: 'shipbob',
  name: 'ShipBob',
}

const opts = { configureBasePath: '/platforms', showOverlay: true }

describe('provider card: verification chip', () => {
  it('renders no chip at all for an unverified platform', async () => {
    const html = await renderGrid([base], opts)
    expect(html).not.toContain('chip--verified')
    expect(html).not.toContain('Unit tested')
    expect(html).not.toContain('Verified')
    expect(html).not.toContain('Scaffolded')
  })

  it('renders each tier with its own label and modifier class', async () => {
    const cases = [
      ['unit-tested', 'Unit tested', 'chip--verified-unit'],
      ['verified', 'Verified', 'chip--verified-api'],
    ] as const
    for (const [tier, label, cls] of cases) {
      const html = await renderGrid([{ ...base, verification: tier }], opts)
      expect(html).toContain(cls)
      expect(html).toContain(label)
    }
  })

  it('gives the chip a title pointing at where the claim is documented', async () => {
    const html = await renderGrid([{ ...base, verification: 'verified' }], opts)
    expect(html).toContain('docs/platforms/platforms.md#verification')
  })

  it('does not render a chip for a tier the UI does not recognise', async () => {
    // A typo or a retired tier name reaching the client must not produce a
    // badge — the lookup misses and the card renders as unverified.
    const html = await renderGrid(
      [{ ...base, verification: 'very-verified' as unknown as PlatformEntry['verification'] }],
      opts,
    )
    expect(html).not.toContain('chip--verified')
    expect(html).not.toContain('very-verified')
  })

  it.each(['sandbox-verified', 'production-verified'])(
    'renders no chip for the retired %s tier, which "verified" replaced',
    async (retired) => {
      // Sandbox and live-tenant runs became one rung, because a sandbox runs
      // the same API as production. The old names are unknown tiers now.
      const html = await renderGrid(
        [{ ...base, verification: retired as unknown as PlatformEntry['verification'] }],
        opts,
      )
      expect(html).not.toContain('chip--verified')
    },
  )

  it('leaves the rest of the card intact — verification never gates Configure', async () => {
    // Unlike `unsupported`, a low tier is a statement about testing, not about
    // connectability. An unverified platform is still fully connectable.
    const html = await renderGrid([{ ...base, verification: 'unit-tested' }], opts)
    expect(html).toContain('Configure</a>')
    expect(html).toContain('ShipBob')
  })

  it('coexists with the unsupported banner when a platform somehow has both', async () => {
    const html = await renderGrid(
      [
        {
          ...base,
          verification: 'unit-tested',
          unsupported: { reason: 'Vendor retired the API.' },
        },
      ],
      opts,
    )
    expect(html).toContain('chip--verified-unit')
    expect(html).toContain('chip--warning')
    expect(html).toContain('Vendor retired the API.')
    // Unsupported still wins on the action: no way to connect it.
    expect(html).not.toContain('Configure</a>')
  })
})
