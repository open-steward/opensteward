/**
 * The connections table and detail page carry the platform's logo.
 *
 * The dashboard's adapter rows got the small logo first; the connections
 * list is the page an operator scans most, and a column of bare slugs is
 * slower to read than the same column with a mark beside each one. The same
 * three modes as everywhere else — monogram, self-hosted, Brandfetch CDN —
 * from the same operator settings, with the same monogram fallback.
 *
 * Two things this pins beyond "the logo is there":
 *
 *   - decoration never takes the page down. Unreadable settings and a slug
 *     the catalogue has never heard of both render a monogram and a 200.
 *   - the settings are read once per list request, not once per row. Fifty
 *     rows must not cost fifty reads — and the loader's own cache must not
 *     be what keeps the count at one.
 *   - the logo never enters the <h1>. The dialog the list opens names itself
 *     from the heading's text, and a monogram in there would be read aloud.
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const listConnectionsPaged = vi.fn()
const getConnection = vi.fn()
const listRuntimeSettings = vi.fn()

vi.mock('../../src/core/proxy/admin-api-client', async () => {
  const { adminApiStub } = await import('../helpers/admin-api-stub')
  return {
    AdminApiClient: adminApiStub({
      listConnectionsPaged,
      getConnection,
      listRuntimeSettings,
      getLoginOptions: async () => ({ providers: [], localLoginEnabled: true }),
    }),
  }
})

// The real loader behind a spy, cache included: loadLogoSettings() memoises
// for 45 seconds, so counting listRuntimeSettings calls would pass a per-row
// implementation as long as the rows were awaited one after another. The
// spy counts what the route asks for, which is the thing to pin.
vi.mock('../../src/core/routes/logo-config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/routes/logo-config')>()
  return { ...actual, loadLogoSettings: vi.fn(actual.loadLogoSettings) }
})

const { buildServer } = await import('../../src/core/server')
const { invalidateLogoSettingsCache, loadLogoSettings } =
  await import('../../src/core/routes/logo-config')

const SESSION_SECRET = 'connections-logos-session-secret-long-enough'
let fastify: FastifyInstance

const FORTNOX = {
  id: '9f8e7d6c-1111-4a2b-8c3d-000000000001',
  vertical: 'accounting',
  platform: 'fortnox',
  label: 'Acme Books',
  status: 'valid',
  tenantId: 'default',
  createdAt: '2026-01-15T09:30:00.000Z',
  updatedAt: '2026-02-01T10:00:00.000Z',
}

const XERO = { ...FORTNOX, id: '9f8e7d6c-2222-4a2b-8c3d-000000000002', platform: 'xero' }

/** A slug the catalogue does not carry: no name, no brand colour, no domain. */
const UNKNOWN = {
  ...FORTNOX,
  id: '9f8e7d6c-3333-4a2b-8c3d-000000000003',
  platform: 'quill-ledger',
}

const setting = (key: string, value: string) => ({
  key,
  value,
  valueType: 'string' as const,
  defaultValue: '',
  description: '',
  category: 'logos',
  isDefault: false,
})

beforeEach(async () => {
  listConnectionsPaged.mockReset().mockResolvedValue({
    data: [FORTNOX, XERO],
    meta: { page: 1, limit: 50, total: 2 },
  })
  getConnection.mockReset().mockResolvedValue(FORTNOX)
  listRuntimeSettings.mockReset().mockResolvedValue([])
  vi.mocked(loadLogoSettings).mockClear()
  invalidateLogoSettingsCache()
  const built = await buildServer({
    server: { port: 0, host: '127.0.0.1' },
    session: { secret: SESSION_SECRET },
    admin_api: { url: 'http://localhost:3001' },
    docs_server: { url: 'http://localhost:3003' },
    sso: { publicBaseUrl: 'http://localhost:3000' },
  })
  fastify = built.fastify
  await fastify.ready()
})

afterEach(async () => {
  await fastify?.close()
})

function get(url: string) {
  const cookie = fastify.signCookie(
    JSON.stringify({ id: 'u1', username: 'admin', role: 'admin', token: 'jwt' }),
  )
  return fastify.inject({ method: 'GET', url, cookies: { session: cookie } })
}

/** The Platform cell of the row for `slug`, so assertions land on one cell. */
function platformCell(body: string, slug: string): string {
  const cells = body.match(/<td[^>]*data-platform-cell[^>]*>[\s\S]*?<\/td>/g) ?? []
  const cell = cells.find((c) => c.includes(`>${slug}<`))
  if (!cell) throw new Error(`no Platform cell for ${slug} in:\n${cells.join('\n')}`)
  return cell
}

/** The detail page's heading group: the logo and the <h1> it sits beside. */
function headingGroup(body: string): string {
  const group = body.match(/<[^>]*data-platform-heading[^>]*>[\s\S]*?<\/h1>/)?.[0]
  if (!group) throw new Error(`no heading group in:\n${body}`)
  return group
}

/** What a DOM's textContent gives for `html`: tags gone, whitespace kept. */
function textContent(html: string): string {
  return html.replace(/<[^>]+>/g, '')
}

describe('the connections table carries each platform’s logo', () => {
  it('shows a brand-tinted monogram when no logo source is configured', async () => {
    const res = await get('/connections')
    expect(res.statusCode).toBe(200)
    const cell = platformCell(res.body, 'fortnox')
    expect(cell).toContain('>Fo</span>')
    expect(cell).toContain('background:#00B04F')
    expect(cell).toContain('vtile--xs')
    expect(res.body).not.toContain('/data/platforms/logos/')
  })

  it('keeps the slug as the visible text and names the platform in a title', async () => {
    // Filters and search key on the slug, so it stays what the eye reads;
    // the catalogue's display name rides along for the hover.
    const cell = platformCell((await get('/connections')).body, 'fortnox')
    expect(cell).toContain('title="Fortnox"')
    expect(cell).toContain('>fortnox<')
  })

  it('shows the self-hosted logo when the operator chose that, with the monogram as its fallback', async () => {
    listRuntimeSettings.mockResolvedValue([setting('logos.source', 'local')])
    const res = await get('/connections')
    expect(res.body).toContain('src="/data/platforms/logos/fortnox.svg"')
    expect(res.body).toContain('src="/data/platforms/logos/xero.svg"')
    expect(platformCell(res.body, 'fortnox')).toContain('data-logo-fallback=')
  })

  it('hotlinks Brandfetch in CDN mode', async () => {
    listRuntimeSettings.mockResolvedValue([
      setting('logos.source', 'cdn'),
      setting('logos.brandfetch_client_id', 'abc123'),
    ])
    const res = await get('/connections')
    expect(res.body).toContain('src="https://cdn.brandfetch.io/fortnox.se/fallback/404/icon?c=abc123"')
  })

  it('still shows monograms, and the page, when the logo settings cannot be read', async () => {
    listRuntimeSettings.mockRejectedValue(new Error('admin-api down'))
    const res = await get('/connections')
    expect(res.statusCode).toBe(200)
    expect(platformCell(res.body, 'fortnox')).toContain('>Fo</span>')
  })

  it('shows a monogram from the slug, in the vertical’s palette, for a slug the catalogue does not know', async () => {
    listConnectionsPaged.mockResolvedValue({
      data: [UNKNOWN],
      meta: { page: 1, limit: 50, total: 1 },
    })
    const res = await get('/connections')
    expect(res.statusCode).toBe(200)
    const cell = platformCell(res.body, 'quill-ledger')
    // No name, so the initials come from the slug and are upper-cased — at
    // 9px in a 20px tile, 'qu' is a smudge and 'QU' is legible. The same
    // monogram the dashboard shows an uncatalogued adapter.
    expect(cell).toContain('>QU</span>')
    expect(cell).toContain('vtile--accounting')
    expect(cell).not.toContain('vtile--brand')
    expect(cell).not.toContain('style="background:')
    // Nothing to hover: the slug is all anyone knows about it.
    expect(cell).not.toContain('title=')
  })

  it('reads the logo settings once per request, not once per row', async () => {
    listConnectionsPaged.mockResolvedValue({
      data: Array.from({ length: 12 }, (_, i) => ({
        ...FORTNOX,
        id: `9f8e7d6c-4444-4a2b-8c3d-${String(i).padStart(12, '0')}`,
      })),
      meta: { page: 1, limit: 50, total: 12 },
    })
    const res = await get('/connections')
    expect(res.statusCode).toBe(200)
    // The spy, not the upstream mock: the loader's own cache would hide a
    // per-row read from listRuntimeSettings, so that count proves nothing.
    expect(loadLogoSettings).toHaveBeenCalledTimes(1)
    expect(listRuntimeSettings).toHaveBeenCalledTimes(1)
  })

  it('ships the script that swaps a broken image for its monogram', async () => {
    const res = await get('/connections')
    expect(res.body).toContain('/public/js/platform-logo.js')
  })
})

describe('the connection detail page carries the platform’s logo beside its heading', () => {
  it('shows the monogram beside the heading by default', async () => {
    const res = await get(`/connections/accounting/${FORTNOX.id}`)
    expect(res.statusCode).toBe(200)
    const heading = headingGroup(res.body)
    expect(heading).toContain('>Fo</span>')
    expect(heading).toContain('background:#00B04F')
    expect(heading).toContain('vtile--sm')
    // The heading itself is the connection's LABEL, not the platform slug —
    // the slug is a field in the card below, and two connections on one
    // platform would otherwise give two identically-headed pages. The
    // monogram is still derived from the platform, which is the point of
    // this case.
    expect(heading).toContain('Acme Books')
  })

  it('keeps the <h1> text-only, so the modal’s accessible name is the connection and nothing else', async () => {
    // resource-modal.js names the dialog from the heading's textContent, and
    // textContent does not honour aria-hidden: a monogram inside the <h1>
    // would have a screen reader announce "Fo Acme Books". The logo sits
    // beside the heading, never in it.
    //
    // The name is the connection's LABEL, which is what makes the dialog
    // identify WHICH connection was opened — every ShipBob connection used to
    // announce simply "shipbob".
    const res = await get(`/connections/accounting/${FORTNOX.id}`)
    const h1 = res.body.match(/<h1[^>]*>[\s\S]*?<\/h1>/)?.[0] ?? ''
    expect(textContent(h1).trim()).toBe('Acme Books')
    expect(h1).not.toContain('vtile')
    // The platform's display name still rides along for the hover, which is
    // now the only place in the heading that names the platform at all.
    expect(h1).toContain('title="Fortnox"')
  })

  it('shows the self-hosted logo in local mode', async () => {
    listRuntimeSettings.mockResolvedValue([setting('logos.source', 'local')])
    const res = await get(`/connections/accounting/${FORTNOX.id}`)
    expect(headingGroup(res.body)).toContain('src="/data/platforms/logos/fortnox.svg"')
  })

  it('still renders when the logo settings cannot be read', async () => {
    listRuntimeSettings.mockRejectedValue(new Error('admin-api down'))
    const res = await get(`/connections/accounting/${FORTNOX.id}`)
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('>Fo</span>')
  })
})
