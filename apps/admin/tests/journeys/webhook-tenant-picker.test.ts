/**
 * Creating a webhook subscription for a chosen tenant.
 *
 * /webhooks/new rendered the tenant as a free-text id pre-filled with
 * `default`. A subscription is scoped to exactly that tenant, so the id had
 * to be known and typed exactly — and a typo scoped it to a tenant that does
 * not exist, whose events then went nowhere, silently. /api-keys/new and
 * wizard step 7 already offer a select; this brings the standalone form in
 * line.
 *
 * Asserts on what an operator can actually pick (`offeredTenantIds`, the
 * same rule api-key-tenant-picker.test.ts models), not on markup for its own
 * sake.
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHmac } from 'crypto'

const mockListTenants = vi.fn()
const mockCreateWebhookSub = vi.fn()

const ONE = [{ id: 'default', name: 'Default' }]
const TWO = [
  { id: 'default', name: 'Default' },
  { id: 'dept-a', name: 'Department A' },
]

vi.mock('../../src/core/proxy/admin-api-client', async () => {
  const { adminApiStub } = await import('../helpers/admin-api-stub')
  return {
    AdminApiClient: adminApiStub({
      listTenants: mockListTenants,
      createWebhookSub: mockCreateWebhookSub,
      getLoginOptions: async () => ({ providers: [], localLoginEnabled: true }),
    }),
  }
})

const { buildServer } = await import('../../src/core/server')

const SESSION_SECRET = 'webhook-tenant-picker-secret-long-enough-x'
let fastify: FastifyInstance

function cookie(): string {
  return fastify.signCookie(
    JSON.stringify({ id: 'u1', username: 'admin', role: 'admin', token: 'jwt' }),
  )
}

function csrf(c: string): string {
  return createHmac('sha256', SESSION_SECRET).update(c).digest('hex').slice(0, 32)
}

const get = (url: string) => fastify.inject({ method: 'GET', url, cookies: { session: cookie() } })

async function post(url: string, payload: Record<string, string>) {
  const c = cookie()
  return fastify.inject({
    method: 'POST',
    url,
    cookies: { session: c },
    payload: { _csrf: csrf(c), ...payload },
  })
}

/** The tenant ids the rendered page lets an operator pick without typing. */
function offeredTenantIds(body: string): string[] {
  const select = body.match(/<select\b[^>]*\bname="tenantId"[^>]*>([\s\S]*?)<\/select>/)
  if (select) return [...select[1].matchAll(/<option\b[^>]*\bvalue="([^"]*)"/g)].map((m) => m[1])
  const input = body.match(/<input\b[^>]*\bname="tenantId"[^>]*>/)
  if (!input) return []
  const current = input[0].match(/\bvalue="([^"]*)"/)?.[1] ?? ''
  return current ? [current] : []
}

const VALID = {
  label: 'Dept A hook',
  url: 'https://hooks.example.com/opensteward',
  eventMode: 'all',
  format: 'opensteward',
}

beforeEach(async () => {
  mockListTenants.mockReset().mockResolvedValue(TWO)
  mockCreateWebhookSub.mockReset().mockResolvedValue({
    id: 'wh-1',
    tenantId: 'dept-a',
    url: VALID.url,
    label: VALID.label,
    secret: 'whsec_once',
    events: null,
    createdAt: '2026-09-01T00:00:00.000Z',
  })
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

describe('Journey: subscribing a webhook for a chosen tenant', () => {
  it('lets the operator pick any registered tenant', async () => {
    const res = await get('/webhooks/new')
    expect(res.statusCode).toBe(200)
    expect(offeredTenantIds(res.body).sort()).toEqual(['default', 'dept-a'])
  })

  it('starts on the default tenant, so nothing changes by accident', async () => {
    const res = await get('/webhooks/new')
    const selected = res.body.match(/<option\b[^>]*\bvalue="([^"]*)"[^>]* selected/)?.[1]
    expect(selected).toBe('default')
  })

  it('is required — a subscription cannot be scoped to no tenant', async () => {
    const res = await get('/webhooks/new')
    expect(res.body).toMatch(/<select\b[^>]*\bname="tenantId"[^>]*\brequired\b/)
  })

  it('creates the subscription in the tenant that was chosen', async () => {
    await post('/webhooks', { tenantId: 'dept-a', ...VALID })
    expect(mockCreateWebhookSub).toHaveBeenCalledWith(
      'jwt',
      expect.objectContaining({ tenantId: 'dept-a' }),
    )
  })

  it('keeps the picker, on the chosen tenant, when another field fails validation', async () => {
    const res = await post('/webhooks', { tenantId: 'dept-a', ...VALID, url: '' })
    expect(res.body).toContain('URL is required')
    expect(offeredTenantIds(res.body).sort()).toEqual(['default', 'dept-a'])
    const selected = res.body.match(/<option\b[^>]*\bvalue="([^"]*)"[^>]* selected/)?.[1]
    expect(selected).toBe('dept-a')
  })

  it('still offers a select on a single-tenant deployment', async () => {
    // One option is still a choice made explicit, and it cannot be mistyped.
    mockListTenants.mockResolvedValue(ONE)
    const res = await get('/webhooks/new')
    expect(offeredTenantIds(res.body)).toEqual(['default'])
    expect(res.body).toMatch(/<select\b[^>]*\bname="tenantId"/)
  })

  it('falls back to a typeable id, and says why, when the tenant list cannot be loaded', async () => {
    // An empty list is an outage, never a deployment with no tenants — the
    // default tenant is seeded by migration. The control must survive it.
    mockListTenants.mockRejectedValue(new Error('admin-api down'))
    const res = await get('/webhooks/new')
    expect(res.statusCode).toBe(200)
    expect(offeredTenantIds(res.body)).toEqual(['default'])
    expect(res.body).toMatch(/<input\b[^>]*\bname="tenantId"[^>]*\brequired\b/)
    expect(res.body).toContain('could not be loaded')
  })
})
