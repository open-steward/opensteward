/**
 * The single-connection view is titled by the connection's LABEL.
 *
 * The label is the only thing that distinguishes one connection from another:
 * the platform slug is already a field in the card below the heading, and an
 * operator with three ShipBob connections saw three pages headed "shipbob".
 * The list already links by label for exactly this reason — the detail page
 * it links to did not follow.
 *
 * Both titles matter and they are separate:
 *  - the browser tab, so a pinned tab and a history entry say which connection
 *  - the <h1>, which `public/js/resource-modal.js` also reads to name the
 *    dialog when this page is opened in one
 *
 * The label is nullable — the rename box clears it to `label: null` — so the
 * platform slug remains the fallback rather than a page headed "Unlabelled".
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetConnection = vi.fn()

vi.mock('../../src/core/proxy/admin-api-client', async () => {
  const { adminApiStub } = await import('../helpers/admin-api-stub')
  return {
    AdminApiClient: adminApiStub({
      getConnection: mockGetConnection,
      listTenants: async () => [],
      getLoginOptions: async () => ({ providers: [], localLoginEnabled: true }),
      getCompanyInfo: async () => null,
    }),
  }
})

const { buildServer } = await import('../../src/core/server')

const SESSION_SECRET = 'connection-detail-title-secret-long-enough'
const CONNECTION = {
  id: '9bdd4a33-40af-437a-9585-76b0fe46b209',
  vertical: 'logistics',
  platform: 'shipbob',
  label: 'Pablo Francisco - ShipBob',
  status: 'valid',
  createdAt: '2026-09-14T09:30:00.000Z',
  updatedAt: '2026-09-17T10:00:00.000Z',
}

let fastify: FastifyInstance

function cookie(role = 'admin') {
  return fastify.signCookie(JSON.stringify({ id: 'u1', username: 'admin', role, token: 'jwt' }))
}

beforeEach(async () => {
  mockGetConnection.mockReset()
  mockGetConnection.mockResolvedValue(CONNECTION)
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

function detail(conn = CONNECTION) {
  return fastify.inject({
    method: 'GET',
    url: `/connections/${conn.vertical}/${conn.id}`,
    cookies: { session: cookie() },
  })
}

describe('Journey: the connection detail page is titled by its label', () => {
  it('heads the page with the label, not the platform slug', async () => {
    const res = await detail()
    expect(res.body).toMatch(/<h1[^>]*>[\s\S]*?Pablo Francisco - ShipBob[\s\S]*?<\/h1>/)
  })

  it('titles the browser tab with the label', async () => {
    const res = await detail()
    expect(res.body).toMatch(/<title>Pablo Francisco - ShipBob - Admin/)
    expect(res.body).not.toMatch(/<title>Connection detail/)
  })

  it('escapes a label containing markup', async () => {
    // The label is operator-supplied free text and reaches both the tab title
    // and the heading, so it must not be able to close either.
    mockGetConnection.mockResolvedValue({ ...CONNECTION, label: '<script>x</script>&co' })
    const res = await detail()
    expect(res.body).not.toContain('<script>x</script>')
    expect(res.body).toMatch(/&lt;script&gt;/)
  })

  it('falls back to the platform slug when the label is cleared', async () => {
    // `label: null` is what the rename box writes when emptied.
    mockGetConnection.mockResolvedValue({ ...CONNECTION, label: null })
    const res = await detail()
    expect(res.body).toMatch(/<h1[^>]*>[\s\S]*?shipbob[\s\S]*?<\/h1>/)
    expect(res.body).not.toMatch(/<title>Unlabelled/)
  })

  it('still names the platform on the page, since the heading no longer does', async () => {
    const res = await detail()
    expect(res.body).toContain('shipbob')
  })
})
