/**
 * `#vertical=<slug>` — the deep link that opens the catalog on one vertical's
 * pill (the docs landing page's "Browse <vertical> adapters" links use it).
 * The harness in `tests/helpers/render-grid.ts` runs the real client-side
 * script produced by `renderPlatformsBody()`.
 *
 * It is a hash rather than `?vertical=` because the admin mounts this same
 * component at `/platforms`, where `?vertical=` already filters the Configure
 * tab's table (apps/admin/src/core/routes/platforms.ts).
 */
import { describe, expect, it } from 'vitest'
import { renderPage } from './helpers/render-grid.js'
import { type PlatformEntry } from '../src/index.js'

const platforms: PlatformEntry[] = [
  { vertical: 'accounting', slug: 'xero', name: 'Xero' },
  { vertical: 'accounting', slug: 'fortnox', name: 'Fortnox' },
  { vertical: 'crm', slug: 'nutshell', name: 'Nutshell' },
  { vertical: 'customer-support', slug: 'zendesk', name: 'Zendesk' },
]
const ALL = ['Xero', 'Fortnox', 'Nutshell', 'Zendesk']

describe('vertical deep link', () => {
  it('selects and filters to the vertical named in the hash', async () => {
    const page = await renderPage(platforms, {}, { hash: '#vertical=accounting' })
    expect(page.pressed()).toBe('accounting')
    expect(page.shown()).toEqual(['Xero', 'Fortnox'])
  })

  it('accepts a hyphenated slug', async () => {
    const page = await renderPage(platforms, {}, { hash: '#vertical=customer-support' })
    expect(page.pressed()).toBe('customer-support')
    expect(page.shown()).toEqual(['Zendesk'])
  })

  it('keeps All when the hash is absent', async () => {
    const page = await renderPage(platforms, {}, { hash: '' })
    expect(page.pressed()).toBe('all')
    expect(page.shown()).toEqual(ALL)
  })

  it('decodes a percent-encoded slug', async () => {
    const page = await renderPage(platforms, {}, { hash: '#vertical=customer%2Dsupport' })
    expect(page.pressed()).toBe('customer-support')
  })

  // `toString`/`constructor` are prototype keys of the counts object, not
  // verticals; `#a#vertical=crm` and `#x&vertical=crm` are not deep links.
  it.each([
    '#vertical=nope',
    '#vertical=',
    '#vertical=%E0%A4%A',
    '#vertical=toString',
    '#vertical=constructor',
    '#a#vertical=crm',
    '#x&vertical=crm',
    '#tag/Accounting',
    '#accounting',
  ])(
    'keeps All for an unknown or unrelated hash (%s)',
    async (hash) => {
      const page = await renderPage(platforms, {}, { hash })
      expect(page.pressed()).toBe('all')
      expect(page.shown()).toEqual(ALL)
    },
  )

  it('follows a hash change to another vertical, and back to All when the hash is cleared', async () => {
    const page = await renderPage(platforms, {}, { hash: '#vertical=accounting' })
    page.setHash('#vertical=crm')
    expect(page.pressed()).toBe('crm')
    expect(page.shown()).toEqual(['Nutshell'])
    page.setHash('')
    expect(page.pressed()).toBe('all')
    expect(page.shown()).toEqual(ALL)
  })

  it('ignores a hash change that carries no vertical parameter', async () => {
    const page = await renderPage(platforms, {}, { hash: '#vertical=crm' })
    page.setHash('#some-anchor')
    expect(page.pressed()).toBe('crm')
  })

  it('keeps a deep-linked URL in step with the pills it clicks', async () => {
    const page = await renderPage(platforms, {}, { hash: '#vertical=accounting' })
    page.click('crm')
    expect(page.hash()).toBe('#vertical=crm')
    page.click('all')
    expect(page.hash()).toBe('')
    // All cleared the hash, but the page is still deep-linked: the next pick
    // must land in the URL again, or a reload would show All.
    page.click('crm')
    expect(page.hash()).toBe('#vertical=crm')
  })

  it('returns to All when the hash is emptied to a bare "#"', async () => {
    const page = await renderPage(platforms, {}, { hash: '#vertical=crm' })
    page.setHash('#')
    expect(page.pressed()).toBe('all')
  })

  it('leaves a hand-picked filter alone when the hash empties on a page that was never deep-linked', async () => {
    // The admin: an in-page anchor, then Back. Before the deep link existed
    // no hash event touched the filter, and none must now.
    const page = await renderPage(platforms, { showOverlay: true, configureBasePath: '/platforms' }, { hash: '' })
    page.click('crm')
    page.setHash('#some-anchor')
    page.setHash('')
    expect(page.pressed()).toBe('crm')
    page.setHash('#')
    expect(page.pressed()).toBe('crm')
  })

  it('opts in when a #vertical= hash arrives later, and then follows the pills', async () => {
    const page = await renderPage(platforms, {}, { hash: '' })
    page.setHash('#vertical=accounting')
    expect(page.pressed()).toBe('accounting')
    page.click('crm')
    expect(page.hash()).toBe('#vertical=crm')
  })

  it('never writes a hash for a page that was not deep-linked', async () => {
    // The admin's Browse tab, and a plain /platforms visit, click pills
    // without the URL changing — exactly as before the deep link existed.
    const page = await renderPage(platforms, { showOverlay: true, configureBasePath: '/platforms' }, { hash: '' })
    page.click('crm')
    expect(page.pressed()).toBe('crm')
    expect(page.hash()).toBe('')
    page.click('crm')
    expect(page.pressed()).toBe('all')
    expect(page.hash()).toBe('')
  })

  it('still renders when the host has no location/window/history', async () => {
    const page = await renderPage(platforms)
    expect(page.pressed()).toBe('all')
    expect(page.shown()).toEqual(ALL)
  })
})
