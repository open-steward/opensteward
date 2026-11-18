import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { openDb } from '../../src/db'
import type { DbHandle } from '../../src/db'
import { ApiKeyStore } from '../../src/auth/api-keys'
import { ConnectSessionStore } from '../../src/auth/connect-sessions'
import { EndUserStore } from '../../src/auth/end-users'
import { CredentialStore } from '../../src/auth/store'
import { createCustomersRouter } from '../../src/control-plane/customers-router'
import { resetRateLimitBuckets } from '../../src/control-plane/rate-limit'

const SECRET = 'customers-router-test-secret-must-be-32-chars'

interface Harness {
  fastify: FastifyInstance
  apiKeys: ApiKeyStore
  endUsers: EndUserStore
  sessions: ConnectSessionStore
  credentials: CredentialStore
  handle: DbHandle
}

async function setup(): Promise<Harness> {
  // One shared handle backs every store (mirrors the boot layer).
  const handle = await openDb({ sqlitePath: ':memory:' })
  const apiKeys = await ApiKeyStore.create(handle, SECRET)
  const endUsers = await EndUserStore.create(handle, SECRET)
  const sessions = await ConnectSessionStore.create(handle)
  const credentials = await CredentialStore.create(handle, SECRET)
  const fastify = Fastify({ logger: false })
  await fastify.register(
    createCustomersRouter({ apiKeys, endUsers, sessions, credentials }),
  )
  await fastify.ready()
  return { fastify, apiKeys, endUsers, sessions, credentials, handle }
}

async function teardown(h: Harness) {
  await h.fastify.close()
  // Stores are borrowers — close the shared handle once.
  await h.handle.close()
}

describe('customers-router', () => {
  let h: Harness

  beforeEach(async () => {
    resetRateLimitBuckets()
    h = await setup()
  })

  afterEach(async () => {
    await teardown(h)
  })

  function bearer(plaintext: string) {
    return { authorization: `Bearer ${plaintext}` }
  }

  describe('auth', () => {
    it('401s when Authorization header is missing', async () => {
      const res = await h.fastify.inject({ method: 'GET', url: '/v1/customers' })
      expect(res.statusCode).toBe(401)
      expect(res.json()).toMatchObject({ error: { code: 'UNAUTHENTICATED' } })
    })

    it('401s on a bogus key', async () => {
      const res = await h.fastify.inject({
        method: 'GET',
        url: '/v1/customers',
        headers: bearer('osk_default_deadbeefdeadbeefdeadbeefdeadbeef'),
      })
      expect(res.statusCode).toBe(401)
    })

    it('401s on a revoked key', async () => {
      const k = await h.apiKeys.mint({ tenantId: 't' })
      await h.apiKeys.revoke(k.id)
      const res = await h.fastify.inject({
        method: 'GET',
        url: '/v1/customers',
        headers: bearer(k.plaintext),
      })
      expect(res.statusCode).toBe(401)
    })
  })

  describe('CRUD with full-access key', () => {
    it('creates, reads, lists, updates, and deletes a customer', async () => {
      const k = await h.apiKeys.mint({ tenantId: 't_crud' })
      const auth = bearer(k.plaintext)

      const create = await h.fastify.inject({
        method: 'POST',
        url: '/v1/customers',
        headers: auth,
        payload: { email: 'jane@acme.com', displayName: 'Jane' },
      })
      expect(create.statusCode).toBe(201)
      const id = create.json().data.id as string
      expect(create.json().data).toMatchObject({
        tenantId: 't_crud',
        email: 'jane@acme.com',
        displayName: 'Jane',
      })

      // PII never leaks on the dev surface
      const read = await h.fastify.inject({
        method: 'GET',
        url: `/v1/customers/${id}`,
        headers: auth,
      })
      expect(read.statusCode).toBe(200)
      expect((read.json().data as Record<string, unknown>).pii).toBeUndefined()

      const list = await h.fastify.inject({
        method: 'GET',
        url: '/v1/customers',
        headers: auth,
      })
      expect(list.json().data).toHaveLength(1)

      const patch = await h.fastify.inject({
        method: 'PATCH',
        url: `/v1/customers/${id}`,
        headers: auth,
        payload: { displayName: 'Jane Doe' },
      })
      expect(patch.statusCode).toBe(200)
      expect(patch.json().data.displayName).toBe('Jane Doe')

      const del = await h.fastify.inject({
        method: 'DELETE',
        url: `/v1/customers/${id}`,
        headers: auth,
      })
      expect(del.statusCode).toBe(204)

      const after = await h.fastify.inject({
        method: 'GET',
        url: `/v1/customers/${id}`,
        headers: auth,
      })
      expect(after.statusCode).toBe(404)
    })

    it('idempotent on (tenant, email): re-create returns existing row with 200', async () => {
      const k = await h.apiKeys.mint({ tenantId: 't' })
      const auth = bearer(k.plaintext)
      const first = await h.fastify.inject({
        method: 'POST',
        url: '/v1/customers',
        headers: auth,
        payload: { email: 'dup@example.com' },
      })
      expect(first.statusCode).toBe(201)
      const second = await h.fastify.inject({
        method: 'POST',
        url: '/v1/customers',
        headers: auth,
        payload: { email: 'dup@example.com' },
      })
      expect(second.statusCode).toBe(200)
      expect(second.json().data.id).toBe(first.json().data.id)
    })

    it("body-supplied tenantId is ignored — scope comes from the API key", async () => {
      const k = await h.apiKeys.mint({ tenantId: 't_real' })
      const auth = bearer(k.plaintext)
      const res = await h.fastify.inject({
        method: 'POST',
        url: '/v1/customers',
        headers: auth,
        // tenantId in the body should not be allowed by the strict zod schema
        payload: { email: 'jane@acme.com', tenantId: 't_other' },
      })
      // The strict body schema rejects extra fields entirely.
      expect(res.statusCode).toBe(400)
      expect(res.json().error.code).toBe('VALIDATION')
    })
  })

  describe('scope enforcement', () => {
    it('GET 403 when key lacks customers:read', async () => {
      const k = await h.apiKeys.mint({ tenantId: 't', scopes: ['customers:write'] })
      const res = await h.fastify.inject({
        method: 'GET',
        url: '/v1/customers',
        headers: bearer(k.plaintext),
      })
      expect(res.statusCode).toBe(403)
      expect(res.json()).toMatchObject({
        error: { code: 'INSUFFICIENT_SCOPE', requiredScope: 'customers:read' },
      })
    })

    it('POST 403 when key lacks customers:write', async () => {
      const k = await h.apiKeys.mint({ tenantId: 't', scopes: ['customers:read'] })
      const res = await h.fastify.inject({
        method: 'POST',
        url: '/v1/customers',
        headers: bearer(k.plaintext),
        payload: { email: 'a@b.test' },
      })
      expect(res.statusCode).toBe(403)
      expect(res.json().error.requiredScope).toBe('customers:write')
    })

    it('mcp:read tokens may GET but not POST/PATCH/DELETE — 403 MCP_READ_ONLY', async () => {
      const k = await h.apiKeys.mint({
        tenantId: 't',
        scopes: ['mcp:read', 'customers:read'],
      })
      const auth = bearer(k.plaintext)
      // GET succeeds — mcp:read is structurally GET-only.
      const list = await h.fastify.inject({ method: 'GET', url: '/v1/customers', headers: auth })
      expect(list.statusCode).toBe(200)
      // POST refused by the auth middleware before scope checks even run.
      const create = await h.fastify.inject({
        method: 'POST',
        url: '/v1/customers',
        headers: auth,
        payload: { email: 'a@b.test' },
      })
      expect(create.statusCode).toBe(403)
      expect(create.json()).toMatchObject({
        error: { code: 'MCP_READ_ONLY' },
      })
    })

    it('customers:* covers both read and write', async () => {
      const k = await h.apiKeys.mint({ tenantId: 't', scopes: ['customers:*'] })
      const auth = bearer(k.plaintext)
      const list = await h.fastify.inject({ method: 'GET', url: '/v1/customers', headers: auth })
      expect(list.statusCode).toBe(200)
      const create = await h.fastify.inject({
        method: 'POST',
        url: '/v1/customers',
        headers: auth,
        payload: { email: 'a@b.test' },
      })
      expect(create.statusCode).toBe(201)
    })

    it('?include_pii=true requires customers:read_pii — 403 otherwise', async () => {
      const k = await h.apiKeys.mint({ tenantId: 't', scopes: ['customers:read'] })
      const customer = await h.endUsers.create({
        tenantId: 't',
        email: 'pii@example.com',
        pii: { firstName: 'Jane', lastName: 'Doe', personalIdNumber: 'SSN-1234' },
      })
      const denied = await h.fastify.inject({
        method: 'GET',
        url: `/v1/customers/${customer.id}?include_pii=true`,
        headers: bearer(k.plaintext),
      })
      expect(denied.statusCode).toBe(403)
      expect(denied.json().error.requiredScope).toBe('customers:read_pii')
    })

    it('?include_pii=true returns decrypted PII when scope granted', async () => {
      const k = await h.apiKeys.mint({
        tenantId: 't',
        scopes: ['customers:read', 'customers:read_pii'],
      })
      const customer = await h.endUsers.create({
        tenantId: 't',
        email: 'pii@example.com',
        pii: { firstName: 'Jane', lastName: 'Doe', personalIdNumber: 'SSN-1234' },
      })
      const ok = await h.fastify.inject({
        method: 'GET',
        url: `/v1/customers/${customer.id}?include_pii=true`,
        headers: bearer(k.plaintext),
      })
      expect(ok.statusCode).toBe(200)
      const data = ok.json().data as { pii?: { firstName?: string; personalIdNumber?: string } }
      expect(data.pii).toBeDefined()
      expect(data.pii?.firstName).toBe('Jane')
      expect(data.pii?.personalIdNumber).toBe('SSN-1234')
    })

    it('default GET still strips PII even with read_pii scope', async () => {
      const k = await h.apiKeys.mint({
        tenantId: 't',
        scopes: ['customers:read', 'customers:read_pii'],
      })
      const customer = await h.endUsers.create({
        tenantId: 't',
        email: 'pii@example.com',
        pii: { firstName: 'Jane' },
      })
      const res = await h.fastify.inject({
        method: 'GET',
        url: `/v1/customers/${customer.id}`,
        headers: bearer(k.plaintext),
      })
      expect(res.statusCode).toBe(200)
      expect((res.json().data as Record<string, unknown>).pii).toBeUndefined()
    })

    it('connections:read and connect-links:write enforced separately', async () => {
      const k = await h.apiKeys.mint({ tenantId: 't', scopes: ['customers:*'] })
      const auth = bearer(k.plaintext)
      const created = await h.endUsers.create({ tenantId: 't', email: 'a@b.test' })

      const conns = await h.fastify.inject({
        method: 'GET',
        url: `/v1/customers/${created.id}/connections`,
        headers: auth,
      })
      expect(conns.statusCode).toBe(403)
      expect(conns.json().error.requiredScope).toBe('connections:read')

      const link = await h.fastify.inject({
        method: 'POST',
        url: `/v1/customers/${created.id}/connect-links`,
        headers: auth,
        payload: { vertical: 'accounting' },
      })
      expect(link.statusCode).toBe(403)
      expect(link.json().error.requiredScope).toBe('connect-links:write')
    })
  })

  describe('tenant isolation', () => {
    it('cross-tenant GET returns 404, not 403, to avoid id leaks', async () => {
      const a = await h.apiKeys.mint({ tenantId: 't_a' })
      const b = await h.apiKeys.mint({ tenantId: 't_b' })
      const ownedByA = await h.endUsers.create({ tenantId: 't_a', email: 'a@example.com' })

      const cross = await h.fastify.inject({
        method: 'GET',
        url: `/v1/customers/${ownedByA.id}`,
        headers: bearer(b.plaintext),
      })
      expect(cross.statusCode).toBe(404)
      expect(cross.json().error.code).toBe('CUSTOMER_NOT_FOUND')

      const own = await h.fastify.inject({
        method: 'GET',
        url: `/v1/customers/${ownedByA.id}`,
        headers: bearer(a.plaintext),
      })
      expect(own.statusCode).toBe(200)
    })

    it("listing only returns the calling key's tenant rows", async () => {
      await h.endUsers.create({ tenantId: 't_a', email: 'a1@example.com' })
      await h.endUsers.create({ tenantId: 't_a', email: 'a2@example.com' })
      await h.endUsers.create({ tenantId: 't_b', email: 'b1@example.com' })

      const a = await h.apiKeys.mint({ tenantId: 't_a' })
      const list = await h.fastify.inject({
        method: 'GET',
        url: '/v1/customers',
        headers: bearer(a.plaintext),
      })
      expect(list.statusCode).toBe(200)
      expect(list.json().data).toHaveLength(2)
      const emails = (list.json().data as Array<{ email: string }>)
        .map((r) => r.email)
        .sort()
      expect(emails).toEqual(['a1@example.com', 'a2@example.com'])
    })
  })

  describe('connect-link spawn', () => {
    it('creates a session bound to the customer with the requested vertical/platform', async () => {
      const k = await h.apiKeys.mint({ tenantId: 't' })
      const customer = await h.endUsers.create({ tenantId: 't', email: 'c@example.com' })

      const res = await h.fastify.inject({
        method: 'POST',
        url: `/v1/customers/${customer.id}/connect-links`,
        headers: bearer(k.plaintext),
        payload: { vertical: 'accounting', platform: 'xero', label: 'demo' },
      })
      expect(res.statusCode).toBe(201)
      const data = res.json().data
      expect(data.endUserId).toBe(customer.id)
      expect(data.allowedVerticals).toEqual(['accounting'])
      expect(data.allowedPlatforms).toEqual([{ vertical: 'accounting', slug: 'xero' }])
      expect(data.label).toBe('demo')
      expect(data.url).toMatch(/\/connect\/[a-f0-9]+$/)
      expect(data.tenantId).toBe('t')
    })

    it('withholds the URL when the Host header is not browser-reachable', async () => {
      // A customer's backend calling this API from inside the same compose
      // network arrives with Host: integration-server:3010. Emitting that as
      // the link they forward to their end-user hands over a dead address.
      const k = await h.apiKeys.mint({ tenantId: 't' })
      const customer = await h.endUsers.create({ tenantId: 't', email: 'c@example.com' })

      const res = await h.fastify.inject({
        method: 'POST',
        url: `/v1/customers/${customer.id}/connect-links`,
        headers: { ...bearer(k.plaintext), host: 'integration-server:3010' },
        payload: { vertical: 'accounting', platform: 'xero', label: 'demo' },
      })
      expect(res.statusCode).toBe(201)
      const data = res.json().data
      expect(data.url).toBeNull()
      expect(data.urlUnresolved).toBe(true)
      // The link still exists — only its address is unknown.
      expect(data.token).toBeTruthy()
    })

    it('honours expiresInSeconds (capped at 90d)', async () => {
      const k = await h.apiKeys.mint({ tenantId: 't' })
      const customer = await h.endUsers.create({ tenantId: 't', email: 'c@example.com' })
      const now = Date.now()
      const res = await h.fastify.inject({
        method: 'POST',
        url: `/v1/customers/${customer.id}/connect-links`,
        headers: bearer(k.plaintext),
        payload: { expiresInSeconds: 60 },
      })
      expect(res.statusCode).toBe(201)
      const expires = res.json().data.expiresAt as number
      expect(expires).toBeGreaterThan(now)
      expect(expires).toBeLessThanOrEqual(now + 60 * 1000 + 5_000)
    })

    it('rejects expiresInSeconds > 90 days', async () => {
      const k = await h.apiKeys.mint({ tenantId: 't' })
      const customer = await h.endUsers.create({ tenantId: 't', email: 'c@example.com' })
      const res = await h.fastify.inject({
        method: 'POST',
        url: `/v1/customers/${customer.id}/connect-links`,
        headers: bearer(k.plaintext),
        payload: { expiresInSeconds: 91 * 24 * 60 * 60 },
      })
      expect(res.statusCode).toBe(400)
    })
  })
})
