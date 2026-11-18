import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { openDb } from '../../src/db'
import type { DbHandle } from '../../src/db'
import { ApiKeyStore } from '../../src/auth/api-keys'
import { InboundEventStore } from '../../src/control-plane/inbound-event-store'
import { createInboundEventsRouter } from '../../src/control-plane/inbound-events-router'
import { resetRateLimitBuckets } from '../../src/control-plane/rate-limit'

const SECRET = 'inbound-events-router-test-secret-32-chars'

interface Harness {
  fastify: FastifyInstance
  apiKeys: ApiKeyStore
  events: InboundEventStore
  handle: DbHandle
}

function ev(over?: Partial<Parameters<InboundEventStore['append']>[0]>) {
  return {
    dedupKey: 'k1',
    tenantId: 'owner1',
    vertical: 'payments',
    platform: 'stripe',
    connectionId: 'conn1',
    eventType: 'charge.succeeded',
    resourceType: 'charges',
    action: 'succeeded',
    resourceId: 'ch_1',
    payload: { id: 'ch_1' },
    ...over,
  }
}

async function setup(): Promise<Harness> {
  // One shared handle backs every store (mirrors the boot layer).
  const handle = await openDb({ sqlitePath: ':memory:' })
  const apiKeys = await ApiKeyStore.create(handle, SECRET)
  const events = await InboundEventStore.create(handle)
  const fastify = Fastify({ logger: false })
  await fastify.register(createInboundEventsRouter({ apiKeys, events }))
  await fastify.ready()
  return { fastify, apiKeys, events, handle }
}

async function teardown(h: Harness) {
  await h.fastify.close()
  // Stores are borrowers — close the shared handle once.
  await h.handle.close()
}

describe('inbound-events-router', () => {
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

  describe('auth + scope', () => {
    it('401s when Authorization header is missing', async () => {
      const res = await h.fastify.inject({ method: 'GET', url: '/v1/events' })
      expect(res.statusCode).toBe(401)
    })

    it('403s when the key lacks events:read', async () => {
      const k = await h.apiKeys.mint({ tenantId: 't_noscope', scopes: ['customers:*'] })
      const res = await h.fastify.inject({
        method: 'GET',
        url: '/v1/events',
        headers: bearer(k.plaintext),
      })
      expect(res.statusCode).toBe(403)
      expect(res.json()).toMatchObject({ error: { code: 'INSUFFICIENT_SCOPE' } })
    })
  })

  describe('tenant isolation', () => {
    it('returns only the calling tenant’s events, never another tenant’s', async () => {
      await h.events.append(ev({ dedupKey: 'a1', tenantId: 'tenant-a', resourceId: 'ch_a1' }))
      await h.events.append(ev({ dedupKey: 'b1', tenantId: 'tenant-b', resourceId: 'ch_b1' }))
      await h.events.append(ev({ dedupKey: 'a2', tenantId: 'tenant-a', resourceId: 'ch_a2' }))

      const k = await h.apiKeys.mint({ tenantId: 'tenant-a', scopes: ['events:read'] })
      const res = await h.fastify.inject({
        method: 'GET',
        url: '/v1/events',
        headers: bearer(k.plaintext),
      })
      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.data.map((r: { resourceId: string }) => r.resourceId)).toEqual([
        'ch_a1',
        'ch_a2',
      ])
      expect(body.meta.count).toBe(2)
    })
  })

  describe('pagination', () => {
    it('pages with after_seq and reports next_cursor as the max seq in the page', async () => {
      const k = await h.apiKeys.mint({ tenantId: 'tp', scopes: ['events:read'] })
      await h.events.append(ev({ dedupKey: 'p1', tenantId: 'tp', resourceId: 'ch_1' }))
      await h.events.append(ev({ dedupKey: 'p2', tenantId: 'tp', resourceId: 'ch_2' }))
      await h.events.append(ev({ dedupKey: 'p3', tenantId: 'tp', resourceId: 'ch_3' }))

      const first = await h.fastify.inject({
        method: 'GET',
        url: '/v1/events?limit=2',
        headers: bearer(k.plaintext),
      })
      const firstBody = first.json()
      expect(firstBody.data.map((r: { resourceId: string }) => r.resourceId)).toEqual([
        'ch_1',
        'ch_2',
      ])
      const cursor = firstBody.meta.next_cursor
      expect(cursor).toBe(firstBody.data[1].seq)

      const second = await h.fastify.inject({
        method: 'GET',
        url: `/v1/events?after_seq=${cursor}`,
        headers: bearer(k.plaintext),
      })
      const secondBody = second.json()
      expect(secondBody.data.map((r: { resourceId: string }) => r.resourceId)).toEqual(['ch_3'])
    })

    it('echoes after_seq as next_cursor when the page is empty', async () => {
      const k = await h.apiKeys.mint({ tenantId: 'te', scopes: ['events:read'] })
      const res = await h.fastify.inject({
        method: 'GET',
        url: '/v1/events?after_seq=99',
        headers: bearer(k.plaintext),
      })
      const body = res.json()
      expect(body.data).toHaveLength(0)
      expect(body.meta.next_cursor).toBe(99)
    })

    it('treats a non-numeric after_seq as 0 instead of NaN-poisoning the query', async () => {
      const k = await h.apiKeys.mint({ tenantId: 'tn', scopes: ['events:read'] })
      await h.events.append(ev({ dedupKey: 'n1', tenantId: 'tn', resourceId: 'ch_n1' }))
      const res = await h.fastify.inject({
        method: 'GET',
        url: '/v1/events?after_seq=not-a-number',
        headers: bearer(k.plaintext),
      })
      expect(res.statusCode).toBe(200)
      expect(res.json().data).toHaveLength(1)
    })
  })
})
