/**
 * `cardFor` in `cdn` logo mode — the Brandfetch hotlink.
 *
 * The URL is `/<domain>/fallback/404/icon?c=<id>`:
 * - `icon` is Brandfetch's square mark. `logo` is the wide wordmark, which
 *   shrinks to a thin strip in the 28px box.
 * - `fallback/404` makes an unknown domain answer 404. The plain `/logo` and
 *   `/icon` forms answer 200 with a placeholder image, so the `<img>` never
 *   errors and the monogram fallback never fires. Checked against the live
 *   CDN on 2026-11-16: stripe.com → 200 image/webp, unknown domain → 404.
 */
import { describe, expect, it } from 'vitest'
import { renderGrid } from './helpers/render-grid.js'
import { type PlatformEntry } from '../src/index.js'

const stripe: PlatformEntry = { vertical: 'payments', slug: 'stripe', name: 'Stripe', domain: 'stripe.com' }

function srcs(html: string): string[] {
  return [...html.matchAll(/<img src="([^"]*)"/g)].map((m) => m[1])
}

describe('provider card: cdn logos', () => {
  it('requests the square icon with a 404 for unknown domains', async () => {
    const html = await renderGrid([stripe], { logoSource: 'cdn', brandfetchClientId: 'abc123' })
    expect(srcs(html)).toEqual(['https://cdn.brandfetch.io/stripe.com/fallback/404/icon?c=abc123'])
  })

  it('URI-encodes the domain and the client id', async () => {
    const html = await renderGrid([{ ...stripe, domain: 'a b.example' }], { logoSource: 'cdn', brandfetchClientId: 'x&y' })
    expect(srcs(html)).toEqual(['https://cdn.brandfetch.io/a%20b.example/fallback/404/icon?c=x%26y'])
  })

  it('renders a monogram, not an image, without a client id or a domain', async () => {
    expect(srcs(await renderGrid([stripe], { logoSource: 'cdn' }))).toEqual([])
    expect(srcs(await renderGrid([{ ...stripe, domain: undefined }], { logoSource: 'cdn', brandfetchClientId: 'abc123' }))).toEqual([])
  })
})
