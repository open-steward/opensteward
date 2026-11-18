/**
 * Test-mode control plane over HTTP: with an osk_test_ key, a developer can
 * exercise customers / connections / webhook-subscriptions / events under
 * /test/v1, not just the vertical resource routes. Pre-seeded deterministic
 * mock data; canned writes; no outbound requests.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildTestServer, type TestServer } from '../integration/helpers'
import { sandboxConnectionId, decodeSandboxLinkToken } from '@opensteward/shared'

const TENANT = 'default'

describe('/test/v1 control plane', () => {
  let server: TestServer
  let testKey: string
  let liveKey: string

  beforeAll(async () => {
    server = await buildTestServer()
    const test = await server.apiKeys.mint({ tenantId: TENANT, scopes: ['*'], mode: 'test' })
    const live = await server.apiKeys.mint({ tenantId: TENANT, scopes: ['*'] })
    testKey = test.plaintext
    liveKey = live.plaintext
  })
  afterAll(async () => {
    await server?.cleanup()
  })

  const auth = (key: string) => ({ authorization: `Bearer ${key}` })
  const get = (url: string, key = testKey) =>
    server.fastify.inject({ method: 'GET', url, headers: auth(key) })

  it('lists seeded sandbox customers and reads one back', async () => {
    const list = await get('/test/v1/customers')
    expect(list.statusCode).toBe(200)
    const customers = list.json().data as Array<{ id: string; email: string }>
    expect(customers.length).toBeGreaterThan(0)
    expect(customers[0]!.email).toContain('@example.test')

    const one = await get(`/test/v1/customers/${customers[0]!.id}`)
    expect(one.statusCode).toBe(200)
    expect(one.json().data.id).toBe(customers[0]!.id)

    const missing = await get('/test/v1/customers/00000000-0000-4000-8000-000000000000')
    expect(missing.statusCode).toBe(404)
  })

  it('canned-creates, patches and deletes a customer', async () => {
    const created = await server.fastify.inject({
      method: 'POST',
      url: '/test/v1/customers',
      headers: { ...auth(testKey), 'content-type': 'application/json' },
      payload: { email: 'made-up@example.test', displayName: 'Made Up' },
    })
    expect(created.statusCode).toBe(201)
    expect(created.json().data.email).toBe('made-up@example.test')

    const seeded = (await get('/test/v1/customers')).json().data[0].id
    const patched = await server.fastify.inject({
      method: 'PATCH',
      url: `/test/v1/customers/${seeded}`,
      headers: { ...auth(testKey), 'content-type': 'application/json' },
      payload: { displayName: 'Renamed' },
    })
    expect(patched.statusCode).toBe(200)
    expect(patched.json().data.displayName).toBe('Renamed')

    const del = await server.fastify.inject({
      method: 'DELETE',
      url: `/test/v1/customers/${seeded}`,
      headers: auth(testKey),
    })
    expect(del.statusCode).toBe(204)
  })

  it('returns a customer’s sandbox connections and mints an OPENABLE connect link', async () => {
    const cid = (await get('/test/v1/customers')).json().data[0].id
    const conns = await get(`/test/v1/customers/${cid}/connections`)
    expect(conns.statusCode).toBe(200)
    expect(conns.json().data.map((c: { vertical: string }) => c.vertical)).toContain('accounting')

    const link = await server.fastify.inject({
      method: 'POST',
      url: `/test/v1/customers/${cid}/connect-links`,
      headers: { ...auth(testKey), 'content-type': 'application/json' },
      payload: {},
    })
    expect(link.statusCode).toBe(201)
    const data = link.json().data
    expect(data.sandbox).toBe(true)
    // The URL now points at the hosted MOCK flow served by this deployment
    // (inject requests arrive with Host: localhost → resolvable), the token
    // round-trips to (tenant, seeded customer), and expiry is in the future.
    expect(data.url).toContain('/test/v1/connect/')
    expect(decodeSandboxLinkToken(data.token)).toEqual({ tenantId: TENANT, customerId: cid })
    expect(Date.parse(data.expiresAt)).toBeGreaterThan(Date.now())
  })

  it('serves the curated sandbox platform catalog', async () => {
    const list = await get('/test/v1/platforms')
    expect(list.statusCode).toBe(200)
    const rows = list.json().data as Array<{ slug: string; vertical: string; enabled: boolean }>
    // Exactly one synthetic `sandbox` entry per vertical, always enabled —
    // the catalog explains the connections the same key lists.
    expect(rows.length).toBe(9)
    expect(rows.every((p) => p.slug === 'sandbox' && p.enabled === true)).toBe(true)
    const conns = (await get('/test/v1/connections')).json().data as Array<{ vertical: string }>
    expect(rows.map((p) => p.vertical).sort()).toEqual(conns.map((c) => c.vertical).sort())

    const filtered = await get('/test/v1/platforms?vertical=crm')
    expect(filtered.json().data).toHaveLength(1)
    const none = await get('/test/v1/platforms?enabled=false')
    expect(none.json().data).toHaveLength(0)

    const one = await get('/test/v1/platforms/accounting/sandbox')
    expect(one.statusCode).toBe(200)
    expect(one.json().data.auth_type).toBe('oauth2')
    // A real platform's slug does not exist in the sandbox catalog.
    const missing = await get('/test/v1/platforms/accounting/fortnox')
    expect(missing.statusCode).toBe(404)
  })

  it('reads a connection by its derived sandbox id, and 404s an unknown one', async () => {
    const id = sandboxConnectionId(TENANT, 'accounting')
    const res = await get(`/test/v1/connections/${id}`)
    expect(res.statusCode).toBe(200)
    expect(res.json().data.platform).toBe('sandbox')

    const missing = await get('/test/v1/connections/00000000-0000-4000-8000-000000000000')
    expect(missing.statusCode).toBe(404)
  })

  it('runs the webhook-subscription lifecycle, with a simulated (non-dialing) test send', async () => {
    const list = await get('/test/v1/webhook-subscriptions')
    expect(list.statusCode).toBe(200)
    const sub = list.json().data[0]
    expect(sub.url).toContain('https://')

    const created = await server.fastify.inject({
      method: 'POST',
      url: '/test/v1/webhook-subscriptions',
      headers: { ...auth(testKey), 'content-type': 'application/json' },
      payload: { url: 'https://hooks.example.test/x' },
    })
    expect(created.statusCode).toBe(201)
    expect(typeof created.json().data.secret).toBe('string')

    const test = await server.fastify.inject({
      method: 'POST',
      url: `/test/v1/webhook-subscriptions/${sub.id}/test`,
      headers: auth(testKey),
    })
    expect(test.statusCode).toBe(200)
    expect(test.json().data.ok).toBe(true)
    expect(test.json().data.simulated).toBe(true)

    const rotate = await server.fastify.inject({
      method: 'POST',
      url: `/test/v1/webhook-subscriptions/${sub.id}/rotate-secret`,
      headers: auth(testKey),
    })
    expect(rotate.statusCode).toBe(200)
    expect(rotate.json().data.secret).toMatch(/^whsec_sandbox_/)
  })

  it('serves a synthetic event stream with a working cursor', async () => {
    const page = await get('/test/v1/events')
    expect(page.statusCode).toBe(200)
    const rows = page.json().data as Array<{ seq: number }>
    expect(rows.length).toBeGreaterThan(0)
    const cursor = page.json().meta.next_cursor
    const after = await get(`/test/v1/events?after_seq=${cursor}`)
    expect(after.json().data).toHaveLength(0)
  })

  it('refuses a LIVE key on every control-plane sandbox route (mode mismatch)', async () => {
    for (const url of [
      '/test/v1/customers',
      '/test/v1/webhook-subscriptions',
      '/test/v1/events',
      '/test/v1/platforms',
      `/test/v1/connections/${sandboxConnectionId(TENANT, 'accounting')}`,
    ]) {
      const res = await get(url, liveKey)
      expect([401, 403], `${url}`).toContain(res.statusCode)
    }
  })

  it('enforces scopes: a read-only test key cannot write', async () => {
    const ro = await server.apiKeys.mint({
      tenantId: TENANT,
      scopes: ['customers:read'],
      mode: 'test',
    })
    const res = await server.fastify.inject({
      method: 'POST',
      url: '/test/v1/customers',
      headers: { authorization: `Bearer ${ro.plaintext}`, 'content-type': 'application/json' },
      payload: { email: 'nope@example.test' },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error.requiredScope).toBe('customers:write')
  })
})
