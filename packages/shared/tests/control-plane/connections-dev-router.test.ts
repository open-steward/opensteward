import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { openDb } from '../../src/db'
import type { DbHandle } from '../../src/db'
import { ApiKeyStore } from '../../src/auth/api-keys'
import { CredentialStore } from '../../src/auth/store'
import { createConnectionsDevRouter } from '../../src/control-plane/connections-dev-router'
import { resetRateLimitBuckets } from '../../src/control-plane/rate-limit'

const SECRET = 'connections-dev-test-secret-must-be-32-chars'

interface Harness {
  fastify: FastifyInstance
  apiKeys: ApiKeyStore
  credentials: CredentialStore
  handle: DbHandle
}

async function setup(): Promise<Harness> {
  // One shared handle backs every store (mirrors the boot layer).
  const handle = await openDb({ sqlitePath: ':memory:' })
  const apiKeys = await ApiKeyStore.create(handle, SECRET)
  const credentials = await CredentialStore.create(handle, SECRET)
  const fastify = Fastify({ logger: false })
  await fastify.register(createConnectionsDevRouter({ apiKeys, credentials }))
  await fastify.ready()
  return { fastify, apiKeys, credentials, handle }
}

async function teardown(h: Harness) {
  await h.fastify.close()
  // Stores are borrowers — close the shared handle once.
  await h.handle.close()
}

function bearer(plaintext: string) {
  return { authorization: `Bearer ${plaintext}` }
}

describe('connections-dev-router', () => {
  let h: Harness

  beforeEach(async () => {
    resetRateLimitBuckets()
    h = await setup()
  })
  afterEach(async () => {
    await teardown(h)
  })

  function seedConnection(opts: {
    platform: string
    vertical: string
    ownerTenantId: string | null
    label?: string
  }): Promise<string> {
    return h.credentials.create(
      opts.platform,
      'oauth-tenant',
      { accessToken: 'tok' },
      opts.label ?? null,
      opts.vertical,
      opts.ownerTenantId,
    )
  }

  it('401 without bearer; 401 with revoked key', async () => {
    const r1 = await h.fastify.inject({ method: 'GET', url: '/v1/connections' })
    expect(r1.statusCode).toBe(401)
    const k = await h.apiKeys.mint({ tenantId: 't' })
    await h.apiKeys.revoke(k.id)
    const r2 = await h.fastify.inject({
      method: 'GET',
      url: '/v1/connections',
      headers: bearer(k.plaintext),
    })
    expect(r2.statusCode).toBe(401)
  })

  it('GET 403 when key lacks connections:read', async () => {
    const k = await h.apiKeys.mint({ tenantId: 't', scopes: ['customers:*'] })
    const res = await h.fastify.inject({
      method: 'GET',
      url: '/v1/connections',
      headers: bearer(k.plaintext),
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error.requiredScope).toBe('connections:read')
  })

  it('PATCH/DELETE 403 when key lacks connections:write', async () => {
    await seedConnection({ platform: 'xero', vertical: 'accounting', ownerTenantId: 't' })
    const k = await h.apiKeys.mint({ tenantId: 't', scopes: ['connections:read'] })
    const list = await h.fastify.inject({
      method: 'GET',
      url: '/v1/connections',
      headers: bearer(k.plaintext),
    })
    const id = list.json().data[0].id as string

    const patch = await h.fastify.inject({
      method: 'PATCH',
      url: `/v1/connections/${id}`,
      headers: bearer(k.plaintext),
      payload: { label: 'new' },
    })
    expect(patch.statusCode).toBe(403)
    expect(patch.json().error.requiredScope).toBe('connections:write')

    const del = await h.fastify.inject({
      method: 'DELETE',
      url: `/v1/connections/${id}`,
      headers: bearer(k.plaintext),
    })
    expect(del.statusCode).toBe(403)
  })

  it('list returns only the calling tenant; cross-tenant GET 404s', async () => {
    const idA = await seedConnection({ platform: 'xero', vertical: 'accounting', ownerTenantId: 't_a' })
    await seedConnection({ platform: 'qbo', vertical: 'accounting', ownerTenantId: 't_b' })
    await seedConnection({ platform: 'orphan', vertical: 'accounting', ownerTenantId: null })

    const a = await h.apiKeys.mint({ tenantId: 't_a' })
    const b = await h.apiKeys.mint({ tenantId: 't_b' })

    const aList = await h.fastify.inject({
      method: 'GET',
      url: '/v1/connections',
      headers: bearer(a.plaintext),
    })
    expect(aList.json().data).toHaveLength(1)
    expect(aList.json().data[0].id).toBe(idA)

    const bRead = await h.fastify.inject({
      method: 'GET',
      url: `/v1/connections/${idA}`,
      headers: bearer(b.plaintext),
    })
    expect(bRead.statusCode).toBe(404)
  })

  it('list filters by ?vertical and ?platform', async () => {
    await seedConnection({ platform: 'xero', vertical: 'accounting', ownerTenantId: 't' })
    await seedConnection({ platform: 'shopify', vertical: 'ecommerce', ownerTenantId: 't' })
    const k = await h.apiKeys.mint({ tenantId: 't' })
    const acc = await h.fastify.inject({
      method: 'GET',
      url: '/v1/connections?vertical=accounting',
      headers: bearer(k.plaintext),
    })
    expect(acc.json().data).toHaveLength(1)
    expect(acc.json().data[0].platform).toBe('xero')
    const shop = await h.fastify.inject({
      method: 'GET',
      url: '/v1/connections?platform=shopify',
      headers: bearer(k.plaintext),
    })
    expect(shop.json().data).toHaveLength(1)
    expect(shop.json().data[0].vertical).toBe('ecommerce')
  })

  it('PATCH renames label; cross-tenant PATCH 404s', async () => {
    const id = await seedConnection({
      platform: 'xero',
      vertical: 'accounting',
      ownerTenantId: 't_a',
      label: 'old',
    })
    const a = await h.apiKeys.mint({ tenantId: 't_a' })
    const b = await h.apiKeys.mint({ tenantId: 't_b' })

    const ok = await h.fastify.inject({
      method: 'PATCH',
      url: `/v1/connections/${id}`,
      headers: bearer(a.plaintext),
      payload: { label: 'renamed' },
    })
    expect(ok.statusCode).toBe(200)
    expect(ok.json().data.label).toBe('renamed')

    const cross = await h.fastify.inject({
      method: 'PATCH',
      url: `/v1/connections/${id}`,
      headers: bearer(b.plaintext),
      payload: { label: 'pwned' },
    })
    expect(cross.statusCode).toBe(404)
  })

  it('DELETE unregisters the platform webhook when the adapter supports it', async () => {
    const unregisterWebhook = vi.fn().mockResolvedValue(undefined)
    const registry = { get: vi.fn().mockReturnValue({ unregisterWebhook }) }
    const fastify = Fastify({ logger: false })
    await fastify.register(
      createConnectionsDevRouter({
        apiKeys: h.apiKeys,
        credentials: h.credentials,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        registry: registry as any,
      }),
    )
    await fastify.ready()
    try {
      const id = await h.credentials.create(
        'stripe',
        'oauth-tenant',
        { accessToken: 'tok', extra: { webhookRegistrationId: 'we_123' } },
        null,
        'payments',
        't',
      )
      const k = await h.apiKeys.mint({ tenantId: 't' })
      const del = await fastify.inject({
        method: 'DELETE',
        url: `/v1/connections/${id}`,
        headers: bearer(k.plaintext),
      })
      expect(del.statusCode).toBe(204)
      expect(unregisterWebhook).toHaveBeenCalledWith(
        expect.objectContaining({ accessToken: 'tok' }),
        'we_123',
      )
    } finally {
      await fastify.close()
    }
  })

  it('DELETE removes only the caller-owned row', async () => {
    const id = await seedConnection({ platform: 'xero', vertical: 'accounting', ownerTenantId: 't' })
    const k = await h.apiKeys.mint({ tenantId: 't' })
    const del = await h.fastify.inject({
      method: 'DELETE',
      url: `/v1/connections/${id}`,
      headers: bearer(k.plaintext),
    })
    expect(del.statusCode).toBe(204)
    const after = await h.fastify.inject({
      method: 'GET',
      url: `/v1/connections/${id}`,
      headers: bearer(k.plaintext),
    })
    expect(after.statusCode).toBe(404)
  })

  it('DELETE cascades exactly like the admin path — listeners fire, external-account link freed', async () => {
    // A raw row delete would leave cached resources behind (no listeners
    // fire) and keep the (platform, external id) mapping pointed at a dead
    // connection, making the customer's next reconnect throw
    // DuplicateExternalAccountError until an operator intervened.
    const id = await seedConnection({ platform: 'stripe', vertical: 'payments', ownerTenantId: 't' })
    await h.credentials.linkExternalAccount('stripe', 'acct_777', id, 'payments')
    const seen: string[] = []
    h.credentials.onDelete(async (row) => {
      seen.push(row.id)
    })

    const k = await h.apiKeys.mint({ tenantId: 't', scopes: ['*'] })
    const del = await h.fastify.inject({
      method: 'DELETE',
      url: `/v1/connections/${id}`,
      headers: bearer(k.plaintext),
    })
    expect(del.statusCode).toBe(204)
    expect(seen).toEqual([id])

    // The same external account can link to a replacement connection.
    const fresh = await seedConnection({ platform: 'stripe', vertical: 'payments', ownerTenantId: 't' })
    await expect(
      h.credentials.linkExternalAccount('stripe', 'acct_777', fresh, 'payments'),
    ).resolves.not.toThrow()
  })

  it('a failed (cross-tenant) DELETE fires no listeners', async () => {
    const id = await seedConnection({ platform: 'stripe', vertical: 'payments', ownerTenantId: 't_other' })
    const seen: string[] = []
    h.credentials.onDelete(async (row) => {
      seen.push(row.id)
    })
    const k = await h.apiKeys.mint({ tenantId: 't', scopes: ['*'] })
    const del = await h.fastify.inject({
      method: 'DELETE',
      url: `/v1/connections/${id}`,
      headers: bearer(k.plaintext),
    })
    expect(del.statusCode).toBe(404)
    expect(seen).toEqual([])
  })
})
