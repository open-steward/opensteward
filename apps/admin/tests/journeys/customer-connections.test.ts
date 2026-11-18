/**
 * A customer's connections, on the customer's own page.
 *
 * The customer page must render the customer's connections — already returned
 * by `GET /api/end-users/:id` — with their health, not just Connect Link
 * sessions. An operator looking at a customer needs to see not only which
 * links were sent but which integrations the customer actually has, and
 * whether any of them work.
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetEndUser = vi.fn()
const mockListEndUserTokens = vi.fn(async () => [])

vi.mock('../../src/core/proxy/admin-api-client', async () => {
  // `await import`: vi.mock is hoisted above this file's imports, but the
  // factory body runs later, so it can import what the top level cannot.
  const { adminApiStub } = await import('../helpers/admin-api-stub')
  return {
    AdminApiClient: adminApiStub({
      getEndUser: mockGetEndUser,
      listEndUserTokens: mockListEndUserTokens,
      getLoginOptions: async () => {
        return { providers: [], localLoginEnabled: true }
      },
      getCompanyInfo: async () => {
        return null
      },
    }),
  }
})

const { buildServer } = await import('../../src/core/server')

const SESSION_SECRET = 'customer-connections-session-secret-long-enough'
const CONNECTION = {
  id: '9f8e7d6c-1111-4a2b-8c3d-000000000001',
  vertical: 'accounting',
  platform: 'fortnox',
  label: 'Acme Books',
  status: 'expired',
  createdAt: '2026-01-15T09:30:00.000Z',
}
const SESSION = {
  id: 'cs_1',
  label: 'Acme onboarding',
  status: 'consumed',
  connectionId: CONNECTION.id,
  createdAt: '2026-01-15T09:00:00.000Z',
  expiresAt: '2026-02-15T09:00:00.000Z',
}
const CUSTOMER = {
  id: 'eu_1',
  email: 'jane@acme.test',
  displayName: 'Jane at Acme',
  sessions: [SESSION],
  connections: [CONNECTION],
}

let fastify: FastifyInstance

beforeEach(async () => {
  mockGetEndUser.mockReset()
  mockGetEndUser.mockResolvedValue(CUSTOMER)
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

function customerPage() {
  const cookie = fastify.signCookie(
    JSON.stringify({ id: 'u1', username: 'admin', role: 'admin', token: 'jwt' }),
  )
  return fastify.inject({ method: 'GET', url: '/customers/eu_1', cookies: { session: cookie } })
}

describe("Journey: reviewing a customer's integrations", () => {
  it("lists the customer's connections on their page", async () => {
    const res = await customerPage()
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('Connections')
    expect(res.body).toContain('Acme Books')
  })

  it('links each connection to its detail page', async () => {
    const res = await customerPage()
    expect(res.body).toContain(`/connections/accounting/${CONNECTION.id}`)
  })

  it('shows whether the connection actually works', async () => {
    // Status comes from upstream: these rows come from store.getRow(), which
    // has no health field of its own.
    const res = await customerPage()
    expect(res.body.toLowerCase()).toContain('expired')
  })

  it('names the connect-links card for what it lists', async () => {
    const res = await customerPage()
    expect(res.body).toContain('Connect links')
    expect(res.body).toContain('Acme onboarding')
  })

  it('links the session row through to the connection it produced', async () => {
    // A session carries the connection id but no vertical; the URL needs both,
    // so the vertical is looked up from the connections list.
    const res = await customerPage()
    const matches = res.body.match(new RegExp(`/connections/accounting/${CONNECTION.id}`, 'g'))
    expect(matches?.length ?? 0).toBeGreaterThanOrEqual(2)
  })

  it('says so plainly when the customer has no connections', async () => {
    mockGetEndUser.mockResolvedValue({ ...CUSTOMER, connections: [] })
    const res = await customerPage()
    expect(res.body).toContain('No connections yet')
  })

  it('notes that the list only covers connections made through connect links', async () => {
    const res = await customerPage()
    expect(res.body).toMatch(/connect links, so a connection created another way/i)
  })
})
