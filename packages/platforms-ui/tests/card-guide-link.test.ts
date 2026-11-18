/**
 * `cardFor` — the "Guide" link, for platforms with an integration guide.
 *
 * docs-server serves guides at `/guides/integrate/<vertical>/<slug>.md` and the
 * admin prefixes that with docs-server's origin (`guideHrefBase`). The
 * opensteward.dev website publishes them at its own paths, so it passes
 * `guideHrefTemplate`. The default must keep producing exactly today's href.
 */
import { describe, expect, it } from 'vitest'
import { renderGrid } from './helpers/render-grid.js'
import { type PlatformEntry } from '../src/index.js'

const zendesk: PlatformEntry = { vertical: 'customer-support', slug: 'zendesk', name: 'Zendesk', has_guide: true }

function guideHrefs(html: string): string[] {
  return [...html.matchAll(/<a href="([^"]*)"[^>]*>Guide<\/a>/g)].map((m) => m[1])
}

describe('provider card: Guide link', () => {
  it('defaults to the docs-server guide path', async () => {
    expect(guideHrefs(await renderGrid([zendesk]))).toEqual(['/guides/integrate/customer-support/zendesk.md'])
  })

  it('prefixes guideHrefBase, as the admin does', async () => {
    const html = await renderGrid([zendesk], { guideHrefBase: 'http://localhost:3003/' })
    expect(guideHrefs(html)).toEqual(['http://localhost:3003/guides/integrate/customer-support/zendesk.md'])
  })

  it('fills guideHrefTemplate in place of the default path', async () => {
    const html = await renderGrid([zendesk], { guideHrefTemplate: '/integrate/{vertical}/{slug}/' })
    expect(guideHrefs(html)).toEqual(['/integrate/customer-support/zendesk/'])
  })

  it('uses the template as given, without guideHrefBase in front', async () => {
    const html = await renderGrid([zendesk], {
      guideHrefBase: 'http://localhost:3003',
      guideHrefTemplate: '/integrate/{vertical}/{slug}/',
    })
    expect(guideHrefs(html)).toEqual(['/integrate/customer-support/zendesk/'])
  })

  it('URI-encodes both placeholders and fills every occurrence', async () => {
    const odd: PlatformEntry = { vertical: 'crm', slug: 'a b/c?d', name: 'Odd', has_guide: true }
    const html = await renderGrid([odd], { guideHrefTemplate: '/g/{vertical}/{slug}#{slug}' })
    expect(guideHrefs(html)).toEqual(['/g/crm/a%20b%2Fc%3Fd#a%20b%2Fc%3Fd'])
  })

  it('renders no Guide link for a platform without a guide', async () => {
    const html = await renderGrid([{ ...zendesk, has_guide: false }], { guideHrefTemplate: '/integrate/{vertical}/{slug}/' })
    expect(guideHrefs(html)).toEqual([])
  })
})
