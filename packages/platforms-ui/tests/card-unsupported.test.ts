/**
 * `cardFor` — unsupported-platform rendering. The shared harness in
 * `tests/helpers/render-grid.ts` runs the real client-side script produced by
 * `renderPlatformsBody()` and returns the grid markup a browser would show.
 */
import { describe, expect, it } from 'vitest'
import { renderGrid } from './helpers/render-grid.js'
import { type PlatformEntry } from '../src/index.js'

const supported: PlatformEntry = {
  vertical: 'ecommerce',
  slug: 'shopify',
  name: 'Shopify',
}

const unsupportedReason =
  'Weebly retired its developer API; there is no supported way to connect an account.'

const unsupported: PlatformEntry = {
  vertical: 'ecommerce',
  slug: 'weebly',
  name: 'Weebly',
  unsupported: {
    reason: unsupportedReason,
    issueUrl: 'https://github.com/open-steward/opensteward/issues/500',
  },
}

const cardOpts = { configureBasePath: '/platforms', showOverlay: true }

describe('provider card: unsupported platforms', () => {
  it('shows a warning chip, the reason, and a tracking-issue link, and drops the Configure action', async () => {
    const html = await renderGrid([unsupported], cardOpts)
    expect(html).toContain('chip--warning')
    expect(html).toContain('Unsupported')
    expect(html).toContain(unsupportedReason)
    expect(html).toContain('href="https://github.com/open-steward/opensteward/issues/500"')
    expect(html).toContain('Tracking issue')
    expect(html).not.toContain('Configure</a>')
    expect(html).not.toContain('Edit config</a>')
  })

  it('escapes a reason containing markup', async () => {
    const html = await renderGrid(
      [{ ...unsupported, unsupported: { reason: '<script>alert(1)</script>' } }],
      cardOpts,
    )
    expect(html).not.toContain('<script>alert')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
  })

  it('omits the tracking-issue link when no issueUrl is given', async () => {
    const html = await renderGrid(
      [{ ...unsupported, unsupported: { reason: 'No API.' } }],
      cardOpts,
    )
    expect(html).not.toContain('Tracking issue')
  })

  it("leaves a supported platform's card unchanged", async () => {
    const withUnsupportedFeature = await renderGrid([supported], cardOpts)
    expect(withUnsupportedFeature).not.toContain('chip--warning')
    expect(withUnsupportedFeature).not.toContain('Unsupported')
    expect(withUnsupportedFeature).toContain('Configure</a>')
  })
})
