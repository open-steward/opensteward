import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createUnifiedAuthMiddleware } from '../../src/control-plane/auth-middleware'

/**
 * Focused coverage of the host→tenant isolation for custom domains per
 * tenant. We stub the stores so the test reaches exactly the
 * two cross-checks: the API-key/host mismatch and the connection-owner/host
 * mismatch. Both must 403 with TENANT_MISMATCH before any data is returned.
 */

const UUID = '11111111-1111-4111-8111-111111111111'

function makeReply() {
  const res: { statusCode?: number; body?: any } = {}
  const reply: any = {
    status(code: number) {
      res.statusCode = code
      return reply
    },
    send(body: unknown) {
      res.body = body
      return reply
    },
    header() {
      return reply
    },
  }
  return { reply, res }
}

describe('unified auth middleware — host→tenant isolation', () => {
  beforeEach(() => {
    process.env['ADMIN_SECRET'] = 'top-secret'
  })
  afterEach(() => {
    delete process.env['ADMIN_SECRET']
  })

  it('403s when a connection is loaded on a different tenant’s domain (admin-secret path)', async () => {
    const store: any = {
      getRow: () => ({ vertical: 'crm', platform: 'x', ownerTenantId: 'dept-b' }),
    }
    const registry: any = { get: () => null }
    const mw = createUnifiedAuthMiddleware({ store, registry })

    const request: any = {
      query: { connection_id: UUID },
      headers: { 'x-admin-secret': 'top-secret' },
      method: 'GET',
      hostTenantId: 'dept-a', // request arrived on dept-a's domain
    }
    const { reply, res } = makeReply()
    await mw(request, reply)

    expect(res.statusCode).toBe(403)
    expect(res.body.error.code).toBe('TENANT_MISMATCH')
  })

  it('allows the admin-secret path when the connection owner matches the host tenant', async () => {
    // Owner matches → passes the owner check, then fails later (adapter null)
    // with a NON-tenant error, proving the tenant gate let it through.
    const store: any = {
      getRow: () => ({ vertical: 'crm', platform: 'x', ownerTenantId: 'dept-a' }),
    }
    const registry: any = { get: () => null }
    const mw = createUnifiedAuthMiddleware({ store, registry })

    const request: any = {
      query: { connection_id: UUID },
      headers: { 'x-admin-secret': 'top-secret' },
      method: 'GET',
      hostTenantId: 'dept-a',
    }
    const { reply, res } = makeReply()
    await mw(request, reply)

    expect(res.statusCode).toBe(404)
    expect(res.body.error.code).toBe('ADAPTER_UNAVAILABLE')
  })

  it('imposes no host constraint on the default tenant (unconfigured host)', async () => {
    const store: any = {
      getRow: () => ({ vertical: 'crm', platform: 'x', ownerTenantId: 'dept-b' }),
    }
    const registry: any = { get: () => null }
    const mw = createUnifiedAuthMiddleware({ store, registry })

    const request: any = {
      query: { connection_id: UUID },
      headers: { 'x-admin-secret': 'top-secret' },
      method: 'GET',
      hostTenantId: 'default', // no custom domain matched → catch-all
    }
    const { reply, res } = makeReply()
    await mw(request, reply)

    // Not a tenant rejection — falls through to the adapter check.
    expect(res.statusCode).toBe(404)
    expect(res.body.error.code).toBe('ADAPTER_UNAVAILABLE')
  })

  it('403s when an API key from another tenant is used on a tenant domain', async () => {
    const store: any = { getRow: () => ({ vertical: 'crm', platform: 'x', ownerTenantId: 'dept-a' }) }
    const registry: any = { get: () => null }
    const apiKeys: any = { verify: () => ({ tenantId: 'dept-a', id: 'k1', scopes: ['*'] }) }
    const sessions: any = { connectionBelongsToTenant: () => true }
    const mw = createUnifiedAuthMiddleware({ store, registry, apiKeys, sessions })

    const request: any = {
      query: { connection_id: UUID },
      headers: { authorization: 'Bearer osk_dept-a_secret' },
      method: 'GET',
      hostTenantId: 'dept-b', // key is dept-a, but domain is dept-b
    }
    const { reply, res } = makeReply()
    await mw(request, reply)

    expect(res.statusCode).toBe(403)
    expect(res.body.error.code).toBe('TENANT_MISMATCH')
  })
})
