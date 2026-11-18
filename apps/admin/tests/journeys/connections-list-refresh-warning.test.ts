/**
 * /connections shows the dashboard's early warning.
 *
 * The "Needs attention" panel lists a still-working connection whose last
 * token refresh failed, and when those rows fall off the panel's cap the
 * "and N more" link lands here. The Status column reads "Healthy" for such a
 * connection — the token still works — so without a second pill the list
 * hides exactly what the link promised to show.
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockListConnectionsPaged = vi.fn()

vi.mock('../../src/core/proxy/admin-api-client', async () => {
  const { adminApiStub } = await import('../helpers/admin-api-stub')
  return {
    AdminApiClient: adminApiStub({
      listConnectionsPaged: mockListConnectionsPaged,
      getLoginOptions: async () => ({ providers: [], localLoginEnabled: true }),
    }),
  }
})

const { buildServer } = await import('../../src/core/server')

const SESSION_SECRET = 'connections-refresh-warning-secret-long-enough'
const HEALTHY = {
  id: '9f8e7d6c-1111-4a2b-8c3d-000000000001',
  vertical: 'accounting',
  platform: 'fortnox',
  label: 'Healthy Co',
  status: 'valid',
  expiresAt: '2026-09-06T00:00:00.000Z',
  createdAt: '2026-01-15T09:30:00.000Z',
  updatedAt: '2026-02-01T10:00:00.000Z',
  lastRefreshAt: '2026-09-05T11:00:00.000Z',
  lastRefreshStatus: 'ok',
}
const REFRESH_FAILING = {
  ...HEALTHY,
  id: '9f8e7d6c-2222-4a2b-8c3d-000000000002',
  label: 'Warn Co',
  lastRefreshStatus: 'failed',
}
const EXPIRED = {
  ...HEALTHY,
  id: '9f8e7d6c-3333-4a2b-8c3d-000000000003',
  label: 'Gone Co',
  status: 'expired',
  lastRefreshStatus: 'expired',
}

let fastify: FastifyInstance

beforeEach(async () => {
  mockListConnectionsPaged.mockReset()
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

function list(rows: object[]) {
  mockListConnectionsPaged.mockResolvedValue({
    data: rows,
    meta: { page: 1, limit: 50, total: rows.length },
  })
  const cookie = fastify.signCookie(
    JSON.stringify({ id: 'u1', username: 'operator', role: 'operator', token: 'jwt' }),
  )
  return fastify.inject({ method: 'GET', url: '/connections', cookies: { session: cookie } })
}

describe('Journey: the connection list surfaces a failing refresh', () => {
  it('shows a Refresh failing pill beside Healthy for a valid connection whose last refresh failed', async () => {
    const res = await list([REFRESH_FAILING])
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('>Healthy<')
    expect(res.body).toContain('>Refresh failing<')
  })

  it('shows it for an expiring_soon connection too: the refresh that would save it is the one failing', async () => {
    const res = await list([{ ...REFRESH_FAILING, status: 'expiring_soon' }])
    expect(res.body).toContain('>Refresh failing<')
  })

  it('shows nothing extra for a healthy connection, or an expired one, which has its own status', async () => {
    const res = await list([HEALTHY, EXPIRED, { ...EXPIRED, lastRefreshStatus: 'failed' }])
    expect(res.body).toContain('>Healthy<')
    expect(res.body).toContain('>Expired<')
    expect(res.body).not.toContain('Refresh failing')
  })
})
