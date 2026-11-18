/**
 * An admin-api outage must not silently choose a tenant.
 *
 * Both pickers are gated on `tenantChoices.length > 1`, fed by
 * `listTenants(...).catch(() => [])`. That catch makes an outage
 * indistinguishable from a single-tenant deployment, so the control vanished —
 * and the POST then did `body.tenantId?.trim() || DEFAULT_TENANT`, quietly
 * scoping the record to `default` with nothing on screen saying a choice had
 * been made for the operator.
 *
 * Zero tenants is not a real state: the `default` tenant is seeded by migration
 * (apps/admin-api/src/core/db/admin-store.ts), so an empty list can only mean
 * the fetch failed. That is what makes the distinction sound rather than a
 * guess — one tenant is legitimately no choice; zero is an outage.
 *
 * The stakes differ between the two, and the customer one is worse: a
 * customer's tenant is fixed at creation and decides which Connect Links may
 * ever name them, so a silent default is not a mistake anyone can correct.
 *
 * This is the named failure class of
 * tests/journeys/upstream-failure-is-not-emptiness.test.ts, whose tenant
 * coverage was a single assertion against the /tenants list page — no picker.
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { offeredOptions } from '../helpers/offered-options'

const mockListTenants = vi.fn()

vi.mock('../../src/core/proxy/admin-api-client', async () => {
  const { adminApiStub } = await import('../helpers/admin-api-stub')
  return {
    AdminApiClient: adminApiStub({
      listTenants: mockListTenants,
      getLoginOptions: async () => ({ providers: [], localLoginEnabled: true }),
      getCompanyInfo: async () => null,
      listScopeGroups: async () => [],
      listConnectLinkTemplates: async () => [],
      listPlatforms: async () => [{ slug: 'xero', enabled: true, hasConfig: true }],
      getVerticals: async () => [{ name: 'accounting' }],
      listEndUsers: async () => [],
    }),
  }
})

const { buildServer } = await import('../../src/core/server')

const SESSION_SECRET = 'tenant-picker-outage-secret-long-enough'
const MANY = [
  { id: 'default', name: 'Default' },
  { id: 'dept-a', name: 'Department A' },
]

let fastify: FastifyInstance

function get(url: string) {
  const c = fastify.signCookie(
    JSON.stringify({ id: 'u1', username: 'admin', role: 'admin', token: 'jwt' }),
  )
  return fastify.inject({ method: 'GET', url, cookies: { session: c } })
}

beforeEach(async () => {
  mockListTenants.mockReset().mockResolvedValue(MANY)
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

const PAGES = [
  { name: 'new connect link', url: '/connect-links/new' },
  { name: 'new customer', url: '/customers/new' },
]

describe.each(PAGES)('Tenant picker on the $name page', ({ url }) => {
  it('offers every tenant when admin-api answers', async () => {
    const res = await get(url)
    expect(offeredOptions(res.body, 'tenantId').sort()).toEqual(['default', 'dept-a'])
  })

  it('still lets the operator set a tenant when admin-api cannot be reached', async () => {
    // The defect: the control disappeared entirely and the POST fell back to
    // DEFAULT_TENANT, so the record was scoped without anyone choosing.
    mockListTenants.mockRejectedValue(new Error('ECONNREFUSED admin-api:3001'))
    const res = await get(url)
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('name="tenantId"')
  })

  it('says the list could not be loaded, rather than looking like a normal form', async () => {
    mockListTenants.mockRejectedValue(new Error('ECONNREFUSED admin-api:3001'))
    const res = await get(url)
    expect(res.body).toContain('could not be loaded')
  })

  it('treats an empty answer as an outage too, not as a tenant-less deployment', async () => {
    // Zero tenants cannot happen — `default` is seeded by migration — so an
    // empty array is the same failure wearing a 200.
    mockListTenants.mockResolvedValue([])
    const res = await get(url)
    expect(res.body).toContain('name="tenantId"')
    expect(res.body).toContain('could not be loaded')
  })

  it('keeps hiding the picker on a genuine single-tenant deployment', async () => {
    // One tenant is really no choice; that behaviour is unchanged, and the
    // outage warning must not fire for it.
    mockListTenants.mockResolvedValue([{ id: 'default', name: 'Default' }])
    const res = await get(url)
    expect(res.body).not.toContain('could not be loaded')
  })
})
