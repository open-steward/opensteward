import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { openDb } from '../../src/db'
import type { DbHandle } from '../../src/db'
import { CredentialStore } from '../../src/auth/store'
import { createUnifiedWebhooksRouter } from '../../src/control-plane/webhooks-router'
import type { WebhookHandler } from '../../src/webhook'

const SECRET = 'webhook-test-secret-must-be-32-chars-long'

const fortnoxHandler: WebhookHandler = {
  verifyWebhook(_payload, headers, secret) {
    return headers['x-test-signature'] === `expected:${secret}`
  },
  parseWebhookEvents(payload) {
    const items = (payload['items'] ?? []) as Array<{
      tenantId?: string
      type?: string
      externalAccountId?: string
    }>
    return items.map((it) => ({
      tenantId: it.tenantId ?? null,
      type: it.type,
      externalAccountId: it.externalAccountId,
    }))
  },
}

describe('createUnifiedWebhooksRouter', () => {
  let handle: DbHandle
  let store: CredentialStore
  let fastify: FastifyInstance

  beforeEach(async () => {
    handle = await openDb({ sqlitePath: ':memory:' })
    store = await CredentialStore.create(handle, SECRET)
    fastify = Fastify({ logger: false })
    await fastify.register(
      createUnifiedWebhooksRouter({
        handlers: {
          accounting: { fortnox: fortnoxHandler },
        },
        store,
        config: {
          adapters: { accounting: { fortnox: { secret: 'shh' } } },
        },
      }),
    )
    await fastify.ready()
  })

  afterEach(async () => {
    await fastify?.close()
    // The store is a borrower — close the shared handle, not the store.
    await handle?.close()
  })

  it('501s when no handler is registered for the (vertical, platform)', async () => {
    // 501 (Not Implemented) — fail-closed: an adapter that ships a
    // webhook.ts but isn't wired into the vertical's WEBHOOK_HANDLERS
    // map would otherwise let the gateway accept unsigned bodies.
    const res = await fastify.inject({
      method: 'POST',
      url: '/webhooks/accounting/unknown-platform',
      headers: { 'content-type': 'application/json', 'x-test-signature': 'expected:shh' },
      payload: { items: [] },
    })
    expect(res.statusCode).toBe(501)
  })

  it('501s for an unknown vertical', async () => {
    const res = await fastify.inject({
      method: 'POST',
      url: '/webhooks/marketing/whatever',
      headers: { 'content-type': 'application/json' },
      payload: { items: [] },
    })
    expect(res.statusCode).toBe(501)
  })

  it('401s when the signature does not verify', async () => {
    const res = await fastify.inject({
      method: 'POST',
      url: '/webhooks/accounting/fortnox',
      headers: { 'content-type': 'application/json', 'x-test-signature': 'wrong' },
      payload: { items: [{ tenantId: 't1', type: 'invoice.created' }] },
    })
    expect(res.statusCode).toBe(401)
  })

  it('400s on invalid JSON body', async () => {
    const res = await fastify.inject({
      method: 'POST',
      url: '/webhooks/accounting/fortnox',
      headers: { 'content-type': 'application/json', 'x-test-signature': 'expected:shh' },
      payload: 'not-json',
    })
    expect(res.statusCode).toBe(400)
  })

  it('parses + resolves via the single-connection fallback', async () => {
    // Exactly one connection for (accounting, fortnox) → every event resolves
    // to it even without an external account id.
    await store.create('fortnox', 't1', { accessToken: 'a' }, 'one', 'accounting')
    const res = await fastify.inject({
      method: 'POST',
      url: '/webhooks/accounting/fortnox',
      headers: { 'content-type': 'application/json', 'x-test-signature': 'expected:shh' },
      payload: {
        items: [
          { tenantId: 't1', type: 'invoice.created' },
          { tenantId: 't2', type: 'invoice.updated' },
        ],
      },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.payload)
    expect(body.received).toBe(true)
    expect(body.eventCount).toBe(2)
  })

  it('prefers parseWebhookEventsWithHeaders and hands it the request headers', async () => {
    // Help Scout sends the event name only in X-HelpScout-Event.
    const headerHandler: WebhookHandler = {
      verifyWebhook: (_p, headers, secret) => headers['x-test-signature'] === `expected:${secret}`,
      parseWebhookEvents: () => [],
      parseWebhookEventsWithHeaders: (_payload, headers) => [
        { tenantId: 't1', type: headers['x-test-event'] },
      ],
    }
    const app = Fastify({ logger: false })
    await app.register(
      createUnifiedWebhooksRouter({
        handlers: { accounting: { fortnox: headerHandler } },
        store,
        config: { adapters: { accounting: { fortnox: { secret: 'shh' } } } },
      }),
    )
    await app.ready()
    await store.create('fortnox', 't1', { accessToken: 'a' }, 'one', 'accounting')
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/accounting/fortnox',
      headers: {
        'content-type': 'application/json',
        'x-test-signature': 'expected:shh',
        'x-test-event': 'convo.created',
      },
      payload: { id: 1 },
    })
    await app.close()
    expect(res.statusCode).toBe(200)
    // parseWebhookEvents alone would yield 0 events.
    expect(JSON.parse(res.payload).eventCount).toBe(1)
  })

  it('FAILS CLOSED: drops events when 2+ connections exist and none resolves', async () => {
    // Two connections, no external-account link, no single-connection fallback
    // → must NOT broadcast (cross-tenant leak). Events are dropped.
    await store.create('fortnox', 't1', { accessToken: 'a' }, 'one', 'accounting')
    await store.create('fortnox', 't2', { accessToken: 'b' }, 'two', 'accounting')

    const res = await fastify.inject({
      method: 'POST',
      url: '/webhooks/accounting/fortnox',
      headers: { 'content-type': 'application/json', 'x-test-signature': 'expected:shh' },
      payload: { items: [{ tenantId: 't1', type: 'invoice.created' }] },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.payload)
    expect(body.eventCount).toBe(0)
  })

  it('routes to exactly the connection linked by external account id', async () => {
    await store.create('fortnox', 't1', { accessToken: 'a' }, 'one', 'accounting')
    const c2 = await store.create('fortnox', 't2', { accessToken: 'b' }, 'two', 'accounting')
    await store.linkExternalAccount('fortnox', 'acct_t2', c2, 'accounting')

    const res = await fastify.inject({
      method: 'POST',
      url: '/webhooks/accounting/fortnox',
      headers: { 'content-type': 'application/json', 'x-test-signature': 'expected:shh' },
      payload: { items: [{ externalAccountId: 'acct_t2', type: 'invoice.created' }] },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.payload)
    // Resolved to the single linked connection — not broadcast to both.
    expect(body.eventCount).toBe(1)
  })

  it('verifies with a per-connection secret (single connection)', async () => {
    const id = await store.create('fortnox', 't1', { accessToken: 'a' }, 'one', 'accounting')
    await store.setWebhookSecret(id, 'per-conn-1')
    const res = await fastify.inject({
      method: 'POST',
      url: '/webhooks/accounting/fortnox',
      headers: { 'content-type': 'application/json', 'x-test-signature': 'expected:per-conn-1' },
      payload: { items: [{ type: 'invoice.created' }] },
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.payload).eventCount).toBe(1)
  })

  it('try-candidates: verifies AND routes to the connection whose secret matches', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    const original = global.fetch
    global.fetch = fetchMock as unknown as typeof fetch

    await store
      .create('fortnox', 't1', { accessToken: 'a' }, 'one', 'accounting')
      .then((id) => store.setWebhookSecret(id, 'sec-1'))
    const c2 = await store.create('fortnox', 't2', { accessToken: 'b' }, 'two', 'accounting')
    await store.setWebhookSecret(c2, 'sec-2')

    const local = Fastify({ logger: false })
    await local.register(
      createUnifiedWebhooksRouter({
        handlers: { accounting: { fortnox: fortnoxHandler } },
        store,
        config: { callbackUrl: 'http://example.com/inbound', adapters: {} },
      }),
    )
    await local.ready()
    try {
      const res = await local.inject({
        method: 'POST',
        url: '/webhooks/accounting/fortnox',
        headers: { 'content-type': 'application/json', 'x-test-signature': 'expected:sec-2' },
        payload: { items: [{ type: 'invoice.created' }] },
      })
      expect(res.statusCode).toBe(200)
      expect(JSON.parse(res.payload).eventCount).toBe(1)
      await new Promise((r) => setTimeout(r, 10))
      const body = JSON.parse(fetchMock.mock.calls[0]![1].body)
      // Routed to c2 — the connection whose secret verified the signature.
      expect(body.events[0].connectionId).toBe(c2)
    } finally {
      await local.close()
      global.fetch = original
    }
  })

  it('401s when neither a per-connection nor the static secret matches', async () => {
    const c1 = await store.create('fortnox', 't1', { accessToken: 'a' }, 'one', 'accounting')
    await store.setWebhookSecret(c1, 'sec-1')
    const c2 = await store.create('fortnox', 't2', { accessToken: 'b' }, 'two', 'accounting')
    await store.setWebhookSecret(c2, 'sec-2')
    const res = await fastify.inject({
      method: 'POST',
      url: '/webhooks/accounting/fortnox',
      headers: { 'content-type': 'application/json', 'x-test-signature': 'expected:nope' },
      payload: { items: [{ type: 'invoice.created' }] },
    })
    expect(res.statusCode).toBe(401)
  })

  it('forwards events to callbackUrl when configured', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    const original = global.fetch
    global.fetch = fetchMock as unknown as typeof fetch

    // One connection so the event resolves (fail-closed would otherwise drop it).
    await store.create('fortnox', 't1', { accessToken: 'a' }, 'one', 'accounting')

    const local = Fastify({ logger: false })
    await local.register(
      createUnifiedWebhooksRouter({
        handlers: { accounting: { fortnox: fortnoxHandler } },
        store,
        config: {
          callbackUrl: 'http://example.com/inbound',
          adapters: { accounting: { fortnox: { secret: 'shh' } } },
        },
      }),
    )
    await local.ready()

    try {
      await local.inject({
        method: 'POST',
        url: '/webhooks/accounting/fortnox',
        headers: { 'content-type': 'application/json', 'x-test-signature': 'expected:shh' },
        payload: { items: [{ tenantId: 't1', type: 'invoice.created' }] },
      })
      // Allow the fire-and-forget forward to complete
      await new Promise((resolve) => setTimeout(resolve, 10))
      expect(fetchMock).toHaveBeenCalledWith(
        'http://example.com/inbound',
        expect.objectContaining({ method: 'POST' }),
      )
    } finally {
      await local.close()
      global.fetch = original
    }
  })

  describe('verifyWebhookWithContext (async path)', () => {
    async function mountAsync(
      handler: WebhookHandler,
      consume = vi.fn(async (_i: unknown) => undefined),
      callbackUrl?: string,
    ) {
      const app = Fastify({ logger: false })
      await app.register(
        createUnifiedWebhooksRouter({
          handlers: { accounting: { fortnox: handler } },
          store,
          // A static secret the sync verifier WOULD accept: the async path
          // must not fall back to it.
          config: {
            adapters: { accounting: { fortnox: { secret: 'shh' } } },
            ...(callbackUrl ? { callbackUrl } : {}),
          },
          consumer: { consume },
        }),
      )
      await app.ready()
      return { app, consume }
    }
    const send = (app: FastifyInstance, payload: unknown = { items: [{ type: 'x.created' }] }) =>
      app.inject({
        method: 'POST',
        url: '/webhooks/accounting/fortnox',
        headers: { 'content-type': 'application/json', 'x-test-signature': 'expected:shh' },
        payload,
      })

    it('routes to the connection it names, hands it candidates, and never calls verifyWebhook', async () => {
      const c1 = await store.create(
        'fortnox',
        't1',
        { accessToken: 'tok1', extra: { orgId: '1' } },
        'one',
        'accounting',
      )
      const c2 = await store.create(
        'fortnox',
        't2',
        { accessToken: 'tok2', extra: { orgId: '2' } },
        'two',
        'accounting',
      )
      await store.setWebhookSecret(c2, 'hook-2')
      const verifyWebhook = vi.fn(() => true)
      const verifyWebhookWithContext = vi.fn(async () => ({
        connectionId: c2,
        bodyAuthenticated: false,
      }))
      const { app, consume } = await mountAsync({
        ...fortnoxHandler,
        verifyWebhook,
        verifyWebhookWithContext,
      })
      try {
        const res = await send(app, { items: [{ type: 'a' }, { type: 'b' }] })
        expect(res.statusCode).toBe(200)
        expect(res.json()).toEqual({ received: true, eventCount: 2 })
        expect(verifyWebhook).not.toHaveBeenCalled()
        const candidates = verifyWebhookWithContext.mock.calls[0]![2] as unknown[]
        expect(candidates).toEqual(
          expect.arrayContaining([
            { connectionId: c1, extra: { orgId: '1' } },
            { connectionId: c2, extra: { orgId: '2' }, webhookSecret: 'hook-2' },
          ]),
        )
        expect(JSON.stringify(candidates)).not.toContain('tok')
        expect(consume).toHaveBeenCalledTimes(2)
        for (const [input] of consume.mock.calls) {
          expect(input).toMatchObject({ connectionId: c2, bodyAuthenticated: false })
        }
      } finally {
        await app.close()
      }
    })

    it('ignores a body-supplied externalAccountId on this path', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true })
      const original = global.fetch
      global.fetch = fetchMock as unknown as typeof fetch
      const c1 = await store.create('fortnox', 't1', { accessToken: 'a' }, 'one', 'accounting')
      const c2 = await store.create('fortnox', 't2', { accessToken: 'b' }, 'two', 'accounting')
      await store.linkExternalAccount('fortnox', 'acct_victim', c2, 'accounting')
      const { app } = await mountAsync(
        {
          ...fortnoxHandler,
          verifyWebhookWithContext: async () => ({ connectionId: c1, bodyAuthenticated: false }),
        },
        undefined,
        'http://example.com/inbound',
      )
      try {
        const res = await send(app, { items: [{ type: 'x', externalAccountId: 'acct_victim' }] })
        expect(res.statusCode).toBe(200)
        await new Promise((r) => setTimeout(r, 10))
        const fwd = JSON.parse(fetchMock.mock.calls[0]![1].body)
        expect(fwd.events[0].connectionId).toBe(c1)
      } finally {
        await app.close()
        global.fetch = original
      }
    })

    it('401s on null, on a throw, and on a connection id that is not a candidate', async () => {
      await store.create('fortnox', 't1', { accessToken: 'a' }, 'one', 'accounting')
      const other = await store.create('other', 't1', { accessToken: 'a' }, 'one', 'accounting')
      for (const verifyWebhookWithContext of [
        async () => null,
        async () => {
          throw new Error('boom')
        },
        async () => ({ connectionId: other, bodyAuthenticated: true }),
        async () => ({ connectionId: 'nope', bodyAuthenticated: true }),
      ]) {
        const { app, consume } = await mountAsync({
          ...fortnoxHandler,
          verifyWebhook: () => true,
          verifyWebhookWithContext,
        })
        try {
          const res = await send(app)
          expect(res.statusCode).toBe(401)
          expect(res.json()).toMatchObject({ error: { code: 'INVALID_WEBHOOK_SIGNATURE' } })
          expect(consume).not.toHaveBeenCalled()
        } finally {
          await app.close()
        }
      }
    })

    it('401s with no connections at all (no static-secret fallback)', async () => {
      const verifyWebhookWithContext = vi.fn(async () => null)
      const { app } = await mountAsync({ ...fortnoxHandler, verifyWebhookWithContext })
      try {
        expect((await send(app)).statusCode).toBe(401)
        expect(verifyWebhookWithContext).toHaveBeenCalledWith(
          expect.any(Buffer),
          expect.any(Object),
          [],
        )
      } finally {
        await app.close()
      }
    })

    it('passes no bodyAuthenticated flag when the handler says the body is authenticated', async () => {
      const c1 = await store.create('fortnox', 't1', { accessToken: 'a' }, 'one', 'accounting')
      const { app, consume } = await mountAsync({
        ...fortnoxHandler,
        verifyWebhookWithContext: async () => ({ connectionId: c1, bodyAuthenticated: true }),
      })
      try {
        expect((await send(app)).statusCode).toBe(200)
        expect(consume.mock.calls[0]![0]).not.toHaveProperty('bodyAuthenticated')
      } finally {
        await app.close()
      }
    })
  })

  it('unchanged path: a sync-only handler leaves the consumer input without bodyAuthenticated', async () => {
    const consume = vi.fn(async (_i: unknown) => undefined)
    const c1 = await store.create('fortnox', 't1', { accessToken: 'a' }, 'one', 'accounting')
    const app = Fastify({ logger: false })
    await app.register(
      createUnifiedWebhooksRouter({
        handlers: { accounting: { fortnox: fortnoxHandler } },
        store,
        config: { adapters: { accounting: { fortnox: { secret: 'shh' } } } },
        consumer: { consume },
      }),
    )
    await app.ready()
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/webhooks/accounting/fortnox',
        headers: { 'content-type': 'application/json', 'x-test-signature': 'expected:shh' },
        payload: { items: [{ type: 'invoice.created' }] },
      })
      expect(res.statusCode).toBe(200)
      const input = consume.mock.calls[0]![0] as Record<string, unknown>
      expect(Object.keys(input).sort()).toEqual([
        'connectionId',
        'event',
        'platform',
        'rawBody',
        'vertical',
      ])
      expect(input['connectionId']).toBe(c1)
    } finally {
      await app.close()
    }
  })
})
