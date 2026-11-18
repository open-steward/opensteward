/**
 * The Browse tab mounts the shared @opensteward/platforms-ui catalog, which
 * the docs landing page deep-links with `/platforms#vertical=<slug>`.
 *
 * Pinned from the admin side: the catalog still renders here with its admin
 * options, and `?vertical=` on this route still belongs to the Configure tab's
 * table filter (which is why the deep link is a hash). The deep link's own
 * behaviour (select, fall back to All, never touch a URL or a filter on a page
 * that did not carry it) is pinned by running the real script in
 * packages/platforms-ui/tests/vertical-deep-link.test.ts.
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/core/proxy/admin-api-client', async () => {
  // `await import`: vi.mock is hoisted above this file's imports, but the
  // factory body runs later, so it can import what the top level cannot.
  const { adminApiStub } = await import('../helpers/admin-api-stub')
  return {
    AdminApiClient: adminApiStub({
      listPlatforms: async (_token: string, vertical: string) => [
        { slug: `${vertical}-one`, enabled: false, hasConfig: false },
      ],
      getLoginOptions: async () => {
        return { providers: [], localLoginEnabled: true }
      },
      listConnections: async () => {
        return []
      },
    }),
  }
})

const { buildServer } = await import('../../src/core/server')

const SESSION_SECRET = 'admin-platforms-browse-secret-long-enough'
let fastify: FastifyInstance

const get = (url: string) =>
  fastify.inject({
    method: 'GET',
    url,
    cookies: {
      session: fastify.signCookie(
        JSON.stringify({ id: 'u1', username: 'admin', role: 'admin', token: 'jwt' }),
      ),
    },
  })

beforeEach(async () => {
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
  vi.clearAllMocks()
})

describe('Journey: an admin opens the platforms Browse tab', () => {
  it('renders the shared catalog with its vertical tablist and admin Configure base', async () => {
    const res = await get('/platforms')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('id="vertical-filters"')
    expect(res.body).toContain('var CONFIGURE_BASE = "/platforms"')
    expect(res.body).toContain('var SHOW_OVERLAY = true')
  })

  it('keeps ?vertical= scoping the Configure table', async () => {
    const res = await get('/platforms?tab=configure&status=all&vertical=crm')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('crm-one')
    expect(res.body).not.toContain('accounting-one')
  })
})
