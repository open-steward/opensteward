/**
 * The Configure tab's platform count must cover the whole catalogue.
 *
 * Two properties pinned, both scoping. The route must derive its vertical list
 * rather than hardcode a subset — a hardcoded five of nine never requests
 * docsign, projects, customer-support and inventory at all. And an upstream
 * failure must surface: a `.catch(() => [])` swallows it — no log, no banner,
 * just a quietly smaller number.
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const ALL_VERTICALS = [
  'accounting',
  'crm',
  'ecommerce',
  'logistics',
  'payments',
  'docsign',
  'projects',
  'customer-support',
  'inventory',
]

const mockListPlatforms = vi.fn(async (_token: string, vertical: string) => [
  { slug: `${vertical}-one`, enabled: false, hasConfig: false },
])

vi.mock('../../src/core/proxy/admin-api-client', async () => {
  // `await import`: vi.mock is hoisted above this file's imports, but the
  // factory body runs later, so it can import what the top level cannot.
  const { adminApiStub } = await import('../helpers/admin-api-stub')
  return {
    AdminApiClient: adminApiStub({
      listPlatforms: mockListPlatforms,
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

const SESSION_SECRET = 'admin-platforms-verticals-secret-long'
let fastify: FastifyInstance

function session() {
  return fastify.signCookie(
    JSON.stringify({ id: 'u1', username: 'admin', role: 'admin', token: 'jwt' }),
  )
}

async function configureTab() {
  return fastify.inject({
    method: 'GET',
    url: '/platforms?tab=configure&status=all',
    cookies: { session: session() },
  })
}

beforeEach(async () => {
  mockListPlatforms.mockImplementation(async (_token: string, vertical: string) => [
    { slug: `${vertical}-one`, enabled: false, hasConfig: false },
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
  vi.clearAllMocks()
})

describe('Journey: an admin opens the platforms Configure tab', () => {
  it('asks for every vertical the platform serves', async () => {
    await configureTab()
    const asked = mockListPlatforms.mock.calls.map((c) => c[1]).sort()
    expect(asked).toEqual([...ALL_VERTICALS].sort())
  })

  it('counts platforms from a vertical outside the original five', async () => {
    const res = await configureTab()
    expect(res.body).toContain('inventory-one')
  })

  it('totals every vertical, none hardcoded', async () => {
    const res = await configureTab()
    // One row per vertical from the stub.
    expect(res.body).toContain(`<strong>${ALL_VERTICALS.length}</strong> total`)
  })

  it('says so when a vertical could not be loaded', async () => {
    mockListPlatforms.mockImplementation(async (_token: string, vertical: string) => {
      if (vertical === 'payments') throw new Error('Unknown vertical')
      return [{ slug: `${vertical}-one`, enabled: false, hasConfig: false }]
    })
    const res = await configureTab()
    expect(res.body).toContain('payments')
    expect(res.body.toLowerCase()).toContain("couldn't be loaded")
  })

  it('still renders the platforms it could load when one vertical fails', async () => {
    mockListPlatforms.mockImplementation(async (_token: string, vertical: string) => {
      if (vertical === 'payments') throw new Error('Unknown vertical')
      return [{ slug: `${vertical}-one`, enabled: false, hasConfig: false }]
    })
    const res = await configureTab()
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('accounting-one')
  })
})
