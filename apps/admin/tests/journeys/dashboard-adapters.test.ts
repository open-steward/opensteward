/**
 * The dashboard names the adapters that are actually running.
 *
 * Each vertical card lists the enabled adapters by name, each linking to its
 * own configuration page — a bare registry count ("281 adapters registered")
 * answers nothing an operator asks: not which adapters are live, not whether
 * their credentials are in place, and it leads nowhere. The one thing the card
 * is for is "what is this deployment actually serving, and take me to it".
 *
 * Two things decide whether that is right rather than merely present:
 *
 *   - /platforms is admin-only for its whole prefix, so the same link handed to
 *     an operator is a 403. They get the adapter's connections instead.
 *   - the rows come from a best-effort call. An empty list because admin-api
 *     did not answer must not read as "nothing is configured", which is the
 *     same sentence with the opposite meaning.
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const listAllPlatformRows = vi.fn()
const listConnections = vi.fn()
const getVerticals = vi.fn()
const listRuntimeSettings = vi.fn()

vi.mock('../../src/core/proxy/admin-api-client', async () => {
  const { adminApiStub } = await import('../helpers/admin-api-stub')
  return {
    AdminApiClient: adminApiStub({
      getVerticals,
      listConnections,
      listAllPlatformRows,
      listRuntimeSettings,
      getLoginOptions: async () => ({ providers: [], localLoginEnabled: true }),
    }),
  }
})

const { buildServer } = await import('../../src/core/server')
const { invalidateLogoSettingsCache } = await import('../../src/core/routes/logo-config')

const SESSION_SECRET = 'dashboard-adapters-secret-long-enough-here'
let fastify: FastifyInstance

const VERTICALS = [
  { name: 'accounting', status: 'up' as const, adapterCount: 2 },
  { name: 'crm', status: 'up' as const, adapterCount: 0 },
]

beforeEach(async () => {
  getVerticals.mockReset().mockResolvedValue(VERTICALS)
  listConnections.mockReset().mockResolvedValue([])
  listRuntimeSettings.mockReset().mockResolvedValue([])
  invalidateLogoSettingsCache()
  listAllPlatformRows.mockReset().mockResolvedValue([
    { vertical: 'accounting', slug: 'fortnox', enabled: true, hasConfig: true },
    { vertical: 'accounting', slug: 'xero', enabled: true, hasConfig: true },
  ])
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

const session = (role = 'admin') =>
  fastify.signCookie(JSON.stringify({ id: 'u1', username: 'admin', role, token: 'jwt' }))

const dashboard = (role = 'admin') =>
  fastify.inject({ method: 'GET', url: '/', cookies: { session: session(role) } })

describe('the vertical card lists its adapters', () => {
  it('names them instead of counting them', async () => {
    const res = await dashboard()
    expect(res.statusCode).toBe(200)
    // Display names, from the on-disk catalogue rather than an upstream call.
    expect(res.body).toContain('Fortnox')
    expect(res.body).toContain('Xero')
    expect(res.body).not.toContain('adapters registered')
  })

  it('links each one to its configuration', async () => {
    const res = await dashboard()
    expect(res.body).toContain('href="/platforms/accounting/fortnox"')
    expect(res.body).toContain('href="/platforms/accounting/xero"')
  })

  it('falls back to the slug when the catalogue does not know the platform', async () => {
    // A locally-added adapter is registered and enabled but absent from the
    // generated catalogue. The row must still appear and still link.
    listAllPlatformRows.mockResolvedValue([
      { vertical: 'accounting', slug: 'not-in-catalogue', enabled: true, hasConfig: true },
    ])
    const res = await dashboard()
    expect(res.body).toContain('not-in-catalogue')
    expect(res.body).toContain('href="/platforms/accounting/not-in-catalogue"')
    // No name to take initials from, so the slug's, upper-cased: at 20px a
    // lowercase 'no' is a smudge, and the connections list shows the same.
    expect(res.body).toContain('>NO</span>')
  })

  it('says so when a vertical has none enabled', async () => {
    const res = await dashboard()
    expect(res.body).toContain('No adapters enabled')
  })

  it('does not list an adapter that is configured but switched off', async () => {
    listAllPlatformRows.mockResolvedValue([
      { vertical: 'accounting', slug: 'fortnox', enabled: false, hasConfig: true },
    ])
    const res = await dashboard()
    // Not in the list — it serves no traffic — but not silently dropped either.
    expect(res.body).not.toContain('href="/platforms/accounting/fortnox"')
    expect(res.body).toContain('1 configured but disabled')
  })
})

describe('the card says what state each adapter is in', () => {
  it('flags an enabled adapter with no credentials', async () => {
    listAllPlatformRows.mockResolvedValue([
      { vertical: 'accounting', slug: 'fortnox', enabled: true, hasConfig: false },
    ])
    const res = await dashboard()
    expect(res.body).toContain('No credentials')
  })

  it('flags credentials the platform has rejected', async () => {
    listConnections.mockResolvedValue([
      { id: 'c1', vertical: 'accounting', platform: 'fortnox', status: 'platform_error' },
    ])
    const res = await dashboard()
    expect(res.body).toContain('Credentials rejected')
  })

  it('counts the connections an adapter is carrying', async () => {
    listConnections.mockResolvedValue([
      { id: 'c1', vertical: 'accounting', platform: 'fortnox', status: 'valid' },
      { id: 'c2', vertical: 'accounting', platform: 'fortnox', status: 'valid' },
    ])
    const res = await dashboard()
    expect(res.body).toContain('2 connections')
  })

  it('puts what needs attention at the top, where the list is truncated', async () => {
    // Eight enabled adapters, six shown. The broken one is alphabetically last
    // and carries no connections, so every other ordering hides it.
    listAllPlatformRows.mockResolvedValue([
      { vertical: 'accounting', slug: 'zoho-books', enabled: true, hasConfig: false },
      ...['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((s) => ({
        vertical: 'accounting',
        slug: `adapter-${s}`,
        enabled: true,
        hasConfig: true,
      })),
    ])
    const res = await dashboard()
    expect(res.body).toContain('href="/platforms/accounting/zoho-books"')
    expect(res.body).toContain('+2 more')
  })
})

describe('a non-admin gets links they can actually follow', () => {
  it('sends an operator to the connections, since /platforms is admin-only', async () => {
    const res = await dashboard('operator')
    expect(res.statusCode).toBe(200)
    // Still named — the information is not admin-only, only the config page is.
    expect(res.body).toContain('Fortnox')
    expect(res.body).not.toContain('/platforms/accounting/fortnox')
    expect(res.body).toContain('href="/connections?vertical=accounting&amp;platform=fortnox"')
  })

  it('offers a viewer no route into /platforms at all', async () => {
    const res = await dashboard('viewer')
    expect(res.body).not.toContain('href="/platforms')
  })
})

describe('when the adapter rows cannot be fetched', () => {
  beforeEach(() => {
    listAllPlatformRows.mockRejectedValue(new Error('admin-api unreachable'))
  })

  it('still renders the dashboard', async () => {
    const res = await dashboard()
    expect(res.statusCode).toBe(200)
  })

  it('does not report the empty list as "nothing configured"', async () => {
    // The failure mode that matters: an operator reading "No adapters enabled"
    // on a deployment that has ten, and going to configure them again.
    const res = await dashboard()
    expect(res.body).not.toContain('No adapters enabled')
    expect(res.body).toContain('list unavailable')
  })
})

describe("each adapter row carries the platform's logo", () => {
  // The logo settings are the operator's (Platforms → Logos); the dashboard
  // reads the same ones the catalog does. Rows come from the on-disk
  // catalogue, which carries the brand colour and domain for every platform.
  const setting = (key: string, value: string) => ({
    key,
    value,
    valueType: 'string' as const,
    defaultValue: '',
    description: '',
    category: 'logos',
    isDefault: false,
  })

  it('shows a brand-tinted monogram when no logo source is configured', async () => {
    const res = await dashboard()
    expect(res.body).toContain('>Fo</span>')
    expect(res.body).toContain('background:#00B04F')
    expect(res.body).not.toContain('/data/platforms/logos/')
  })

  it('shows the self-hosted logo when the operator chose that, with the monogram as its fallback', async () => {
    listRuntimeSettings.mockResolvedValue([setting('logos.source', 'local')])
    const res = await dashboard()
    expect(res.body).toContain('src="/data/platforms/logos/fortnox.svg"')
    expect(res.body).toContain('src="/data/platforms/logos/xero.svg"')
    expect(res.body).toContain('data-logo-fallback=')
  })

  it('hotlinks Brandfetch in CDN mode', async () => {
    listRuntimeSettings.mockResolvedValue([
      setting('logos.source', 'cdn'),
      setting('logos.brandfetch_client_id', 'abc123'),
    ])
    const res = await dashboard()
    expect(res.body).toContain('src="https://cdn.brandfetch.io/fortnox.se/fallback/404/icon?c=abc123"')
  })

  it('still shows monograms when the logo settings cannot be read', async () => {
    listRuntimeSettings.mockRejectedValue(new Error('admin-api down'))
    const res = await dashboard()
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('>Fo</span>')
  })

  it('ships the script that swaps a broken image for its monogram', async () => {
    const res = await dashboard()
    expect(res.body).toContain('/public/js/platform-logo.js')
  })
})
