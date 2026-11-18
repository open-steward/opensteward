/**
 * Webhook subscription self-service for developers.
 *
 * Without self-service, every integration needs an operator round-trip to
 * register an endpoint.
 * These pin the dev surface's contract: tenant comes from the key and never
 * the body, cross-tenant ids answer 404 (anti-enumeration, same rule as the
 * connections dev router), the signing secret is returned exactly once, and
 * a per-tenant quota bounds runaway creation.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { openDb } from '../../src/db'
import type { DbHandle } from '../../src/db'
import { ApiKeyStore } from '../../src/auth/api-keys'
import { WebhookSubscriptionStore } from '../../src/auth/webhook-subscriptions'
import {
  createWebhookSubsDevRouter,
  MAX_WEBHOOK_SUBS_PER_TENANT,
} from '../../src/control-plane/webhook-subs-dev-router'
import { resetRateLimitBuckets } from '../../src/control-plane/rate-limit'

const SECRET = 'webhook-dev-router-secret-must-be-32ch!'

describe('webhook-subs-dev-router', () => {
  let handle: DbHandle
  let fastify: FastifyInstance
  let apiKeys: ApiKeyStore
  let subs: WebhookSubscriptionStore
  let fetchImpl: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    resetRateLimitBuckets()
    handle = await openDb({ sqlitePath: ':memory:' })
    apiKeys = await ApiKeyStore.create(handle, SECRET)
    subs = await WebhookSubscriptionStore.create(handle, SECRET)
    fetchImpl = vi.fn().mockResolvedValue({ status: 200, text: async () => 'ok' })
    fastify = Fastify({ logger: false })
    await fastify.register(
      createWebhookSubsDevRouter({
        apiKeys,
        subs,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    )
    await fastify.ready()
  })
  afterEach(async () => {
    await fastify?.close()
    await handle?.close()
  })

  const bearer = (plaintext: string) => ({ authorization: `Bearer ${plaintext}` })
  const mint = (tenantId: string, scopes: string[] = ['webhooks:read', 'webhooks:write']) =>
    apiKeys.mint({ tenantId, scopes })

  it('401 without a key; 403 without the scope', async () => {
    const anon = await fastify.inject({ method: 'GET', url: '/v1/webhook-subscriptions' })
    expect(anon.statusCode).toBe(401)

    const readOnly = await mint('t', ['webhooks:read'])
    const write = await fastify.inject({
      method: 'POST',
      url: '/v1/webhook-subscriptions',
      headers: bearer(readOnly.plaintext),
      payload: { url: 'https://hooks.example.com/a' },
    })
    expect(write.statusCode).toBe(403)
    expect(write.json().error.requiredScope).toBe('webhooks:write')

    const noRead = await mint('t', ['customers:read'])
    const list = await fastify.inject({
      method: 'GET',
      url: '/v1/webhook-subscriptions',
      headers: bearer(noRead.plaintext),
    })
    expect(list.statusCode).toBe(403)
  })

  it('create pins the tenant from the key and returns the secret once', async () => {
    const k = await mint('t_a')
    const res = await fastify.inject({
      method: 'POST',
      url: '/v1/webhook-subscriptions',
      headers: bearer(k.plaintext),
      // No tenantId field exists on this surface; a smuggled one is a
      // validation error rather than a privilege escalation.
      payload: { url: 'https://hooks.example.com/a', events: ['customer.*'] },
    })
    expect(res.statusCode).toBe(201)
    const created = res.json().data
    expect(created.tenantId).toBe('t_a')
    expect(typeof created.secret).toBe('string')

    const smuggled = await fastify.inject({
      method: 'POST',
      url: '/v1/webhook-subscriptions',
      headers: bearer(k.plaintext),
      payload: { url: 'https://hooks.example.com/b', tenantId: 't_other' },
    })
    expect(smuggled.statusCode).toBe(400)

    // The list read never carries the secret again.
    const list = await fastify.inject({
      method: 'GET',
      url: '/v1/webhook-subscriptions',
      headers: bearer(k.plaintext),
    })
    expect(list.json().data).toHaveLength(1)
    expect(list.json().data[0].secret).toBeUndefined()
  })

  it("cross-tenant ids answer 404 on every route, and lists are isolated", async () => {
    const a = await mint('t_a')
    const b = await mint('t_b')
    const created = await subs.create({ tenantId: 't_a', url: 'https://hooks.example.com/a' })

    const bList = await fastify.inject({
      method: 'GET',
      url: '/v1/webhook-subscriptions',
      headers: bearer(b.plaintext),
    })
    expect(bList.json().data).toHaveLength(0)

    for (const [method, url] of [
      ['GET', `/v1/webhook-subscriptions/${created.id}`],
      ['PATCH', `/v1/webhook-subscriptions/${created.id}`],
      ['DELETE', `/v1/webhook-subscriptions/${created.id}`],
      ['POST', `/v1/webhook-subscriptions/${created.id}/test`],
      ['POST', `/v1/webhook-subscriptions/${created.id}/rotate-secret`],
      ['POST', `/v1/webhook-subscriptions/${created.id}/paused`],
    ] as const) {
      const res = await fastify.inject({
        method,
        url,
        headers: bearer(b.plaintext),
        ...(method === 'PATCH' ? { payload: { label: 'x' } } : {}),
      })
      expect(res.statusCode, `${method} ${url}`).toBe(404)
    }

    // The owner still can.
    const own = await fastify.inject({
      method: 'GET',
      url: `/v1/webhook-subscriptions/${created.id}`,
      headers: bearer(a.plaintext),
    })
    expect(own.statusCode).toBe(200)
  })

  it('patch changes label/format; delete removes', async () => {
    const k = await mint('t')
    const created = await subs.create({ tenantId: 't', url: 'https://hooks.example.com/a' })
    const patch = await fastify.inject({
      method: 'PATCH',
      url: `/v1/webhook-subscriptions/${created.id}`,
      headers: bearer(k.plaintext),
      payload: { label: 'billing', format: 'flat' },
    })
    expect(patch.statusCode).toBe(200)
    expect(patch.json().data.label).toBe('billing')
    expect(patch.json().data.format).toBe('flat')

    const del = await fastify.inject({
      method: 'DELETE',
      url: `/v1/webhook-subscriptions/${created.id}`,
      headers: bearer(k.plaintext),
    })
    expect(del.statusCode).toBe(204)
    expect(await subs.list('t')).toHaveLength(0)
  })

  it('test-send delivers one synthetic event through the injected fetch', async () => {
    const k = await mint('t')
    const created = await subs.create({ tenantId: 't', url: 'https://hooks.example.com/a' })
    const res = await fastify.inject({
      method: 'POST',
      url: `/v1/webhook-subscriptions/${created.id}/test`,
      headers: bearer(k.plaintext),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.ok).toBe(true)
    expect(res.json().data.status).toBe(200)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('rotate-secret returns a fresh secret once', async () => {
    const k = await mint('t')
    const created = await subs.create({ tenantId: 't', url: 'https://hooks.example.com/a' })
    const res = await fastify.inject({
      method: 'POST',
      url: `/v1/webhook-subscriptions/${created.id}/rotate-secret`,
      headers: bearer(k.plaintext),
    })
    expect(res.statusCode).toBe(200)
    expect(typeof res.json().data.secret).toBe('string')
    expect(res.json().data.secret).not.toBe(created.secret)
  })

  it('the per-tenant quota refuses creation past the cap', async () => {
    const k = await mint('t')
    for (let i = 0; i < MAX_WEBHOOK_SUBS_PER_TENANT; i++) {
      await subs.create({ tenantId: 't', url: `https://hooks.example.com/${i}` })
    }
    const res = await fastify.inject({
      method: 'POST',
      url: '/v1/webhook-subscriptions',
      headers: bearer(k.plaintext),
      payload: { url: 'https://hooks.example.com/one-too-many' },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error.code).toBe('WEBHOOK_SUB_QUOTA_EXCEEDED')
    // Another tenant's budget is its own.
    const other = await mint('t_other')
    const ok = await fastify.inject({
      method: 'POST',
      url: '/v1/webhook-subscriptions',
      headers: bearer(other.plaintext),
      payload: { url: 'https://hooks.example.com/fresh' },
    })
    expect(ok.statusCode).toBe(201)
  })
})
