/**
 * The status pills: All, Verified and Unsupported, after the
 * vertical pills. One status at a time, ANDed with the vertical (and the
 * search). Clicking the pressed pill goes back to All, as the vertical pills
 * do. Status has no deep link: it never reads or writes the URL.
 *
 * Runs the real client script through `renderPage` in
 * tests/helpers/render-grid.ts.
 */
import { describe, expect, it } from 'vitest'
import { renderPage } from './helpers/render-grid.js'
import { renderPlatformsParts, type PlatformEntry } from '../src/index.js'

const platforms: PlatformEntry[] = [
  { vertical: 'accounting', slug: 'xero', name: 'Xero', verification: 'verified' },
  { vertical: 'accounting', slug: 'fortnox', name: 'Fortnox', verification: 'unit-tested' },
  {
    vertical: 'accounting',
    slug: 'visma',
    name: 'Visma',
    unsupported: { reason: 'No public API' },
  },
  { vertical: 'crm', slug: 'nutshell', name: 'Nutshell', verification: 'verified' },
  {
    vertical: 'crm',
    slug: 'pipedrive',
    name: 'Pipedrive',
    unsupported: { reason: 'Partner-only' },
  },
  { vertical: 'payments', slug: 'stripe', name: 'Stripe', verification: 'unit-tested' },
]
const ALL = ['Xero', 'Fortnox', 'Visma', 'Nutshell', 'Pipedrive', 'Stripe']

describe('status filters', () => {
  it('puts an empty, labelled group after the vertical pills in the markup', () => {
    const { body } = renderPlatformsParts()
    const group =
      '<div class="segmented" id="status-filters" role="group" aria-label="Filter by status"></div>'
    expect(body).toContain(group)
    expect(body.indexOf(group)).toBeGreaterThan(body.indexOf('id="vertical-filters"'))
  })

  it('lets both filter groups wrap inside the controls row at phone width', () => {
    expect(renderPlatformsParts().styles).toMatch(
      /\.providers-controls \.segmented\s*\{\s*flex-wrap:\s*wrap;\s*max-width:\s*100%;\s*\}/,
    )
  })

  it('renders All, Verified and Unsupported with their counts, All pressed', async () => {
    const page = await renderPage(platforms)
    expect(page.statusLabels()).toEqual(['All · 6', 'Verified · 2', 'Unsupported · 2'])
    expect(page.pressedStatus()).toBe('all')
    expect(page.shown()).toEqual(ALL)
  })

  it('counts zero when nothing has the status', async () => {
    const page = await renderPage([{ vertical: 'crm', slug: 'a', name: 'A' }])
    expect(page.statusLabels()).toEqual(['All · 1', 'Verified · 0', 'Unsupported · 0'])
  })

  it('Verified shows only verified platforms, not unit-tested ones', async () => {
    const page = await renderPage(platforms)
    page.clickStatus('verified')
    expect(page.pressedStatus()).toBe('verified')
    expect(page.shown()).toEqual(['Xero', 'Nutshell'])
  })

  it('Unsupported shows only unsupported platforms', async () => {
    const page = await renderPage(platforms)
    page.clickStatus('unsupported')
    expect(page.pressedStatus()).toBe('unsupported')
    expect(page.shown()).toEqual(['Visma', 'Pipedrive'])
  })

  it('takes one status at a time', async () => {
    const page = await renderPage(platforms)
    page.clickStatus('unsupported')
    page.clickStatus('verified')
    expect(page.pressedStatus()).toBe('verified')
    expect(page.shown()).toEqual(['Xero', 'Nutshell'])
  })

  it('combines with a vertical, from either side', async () => {
    const page = await renderPage(platforms)
    page.click('accounting')
    page.clickStatus('verified')
    expect(page.pressed()).toBe('accounting')
    expect(page.shown()).toEqual(['Xero'])
    page.click('crm')
    expect(page.pressedStatus()).toBe('verified')
    expect(page.shown()).toEqual(['Nutshell'])
    page.clickStatus('unsupported')
    expect(page.shown()).toEqual(['Pipedrive'])
  })

  it('shows nothing when the vertical has no platform with the status', async () => {
    const page = await renderPage(platforms)
    page.click('payments')
    page.clickStatus('unsupported')
    expect(page.shown()).toEqual([])
  })

  it('goes back to All when the pressed pill is clicked again', async () => {
    const page = await renderPage(platforms)
    page.clickStatus('unsupported')
    page.clickStatus('unsupported')
    expect(page.pressedStatus()).toBe('all')
    expect(page.shown()).toEqual(ALL)
  })

  it('goes back to All from the All pill, keeping the vertical', async () => {
    const page = await renderPage(platforms)
    page.click('accounting')
    page.clickStatus('unsupported')
    page.clickStatus('all')
    expect(page.pressedStatus()).toBe('all')
    expect(page.pressed()).toBe('accounting')
    expect(page.shown()).toEqual(['Xero', 'Fortnox', 'Visma'])
  })

  it('leaves the #vertical= deep link alone', async () => {
    const page = await renderPage(platforms, {}, { hash: '#vertical=crm' })
    page.clickStatus('unsupported')
    expect(page.hash()).toBe('#vertical=crm')
    expect(page.shown()).toEqual(['Pipedrive'])
    page.setHash('#vertical=accounting')
    expect(page.pressedStatus()).toBe('unsupported')
    expect(page.shown()).toEqual(['Visma'])
  })

  it('never writes a hash on a page that was not deep-linked', async () => {
    const page = await renderPage(platforms, {}, { hash: '' })
    page.clickStatus('verified')
    expect(page.hash()).toBe('')
  })
})
