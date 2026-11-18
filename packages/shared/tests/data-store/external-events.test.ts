/**
 * External-mode events: confirms `attachDataStoreContext` produces a per-
 * request emitter that, when called, lands a row in the existing webhook
 * deliveries queue with the right HMAC signature and event type.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHmac } from 'node:crypto'
import Fastify from 'fastify'
import { openDb, setDnsResolver } from '@opensteward/shared'
import type { DbHandle } from '@opensteward/shared'
import { attachDataStoreContext, WebhookSubscriptionStore, WebhookDeliveryStore } from '../../src'

interface RawDeliveryRow {
  body: string
  signature: string
}

// The emitter fires `emitTenantEvent` as a floating promise (the `emit`
// callback returns void), so the durable enqueue completes shortly after the
// request resolves. Yield the event loop a few times so the awaited
// matching()→enqueue() chain (synchronous SQLite under the hood) settles
// before we assert.
async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await new Promise((resolve) => setImmediate(resolve))
  }
}

/**
 * After the durable enqueue, the emitter also kicks off a best-effort inline
 * POST whose `.then`/`.catch` writes back to the (borrowed) stores. Those
 * floating writes must finish before teardown closes the shared handle, or
 * they hit a destroyed driver. Poll until no delivery row is still `pending`
 * (the inline write-back drives each row to `delivered`/`dead`), bounded so a
 * test that never emits returns immediately.
 */
async function drainInFlight(deliveries: WebhookDeliveryStore, handle: DbHandle): Promise<void> {
  for (let i = 0; i < 50; i++) {
    await flush()
    const pending = (await handle.kysely
      .selectFrom('webhook_deliveries')
      .select('id')
      .where('status', '=', 'pending')
      .execute()) as Array<{ id: string }>
    if (pending.length === 0) break
  }
  // One more flush so the trailing `recordResult` write (which follows the
  // delivery-row update in the inline `.then`) also lands before close.
  await flush()
}

// `.db` is gone — read the raw delivery row through the shared handle's
// Kysely query builder instead.
async function getDeliveryBody(handle: DbHandle, id: string): Promise<RawDeliveryRow | null> {
  const row = (await handle.kysely
    .selectFrom('webhook_deliveries')
    .select(['body', 'signature'])
    .where('id', '=', id)
    .executeTakeFirst()) as RawDeliveryRow | undefined
  return row ?? null
}

describe('external-mode resource events', () => {
  let dir: string
  let handle: DbHandle
  let subs: WebhookSubscriptionStore
  let deliveries: WebhookDeliveryStore

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'oi-ext-'))
    // Both stores share ONE handle (like boot).
    handle = await openDb({ sqlitePath: join(dir, 'wh.db') })
    subs = await WebhookSubscriptionStore.create(handle, 'a'.repeat(40))
    deliveries = await WebhookDeliveryStore.create(handle)

    // The emitter makes a best-effort inline POST via `safeFetch` as a floating
    // promise; its `.then`/`.catch` then writes back to the (borrowed) stores.
    // Make that attempt resolve deterministically and instantly so it settles
    // before teardown closes the shared handle — otherwise the late write hits
    // a destroyed driver. We only assert on the durably-enqueued row, never on
    // delivery status, so a stubbed 200 keeps every assertion's intent intact.
    setDnsResolver(async () => ({ address: '93.184.216.34' })) // public IP, passes SSRF check
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }))
  })

  afterEach(async () => {
    // Let any in-flight inline-delivery callbacks (which touch the borrowed
    // stores) settle before we close the shared handle.
    await drainInFlight(deliveries, handle)
    vi.restoreAllMocks()
    setDnsResolver(undefined)
    // Stores BORROW the handle — close the handle, never the stores.
    await handle?.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('emit upsert lands a signed delivery for matching subscriptions', async () => {
    const subscription = await subs.create({
      tenantId: 'tenant-a',
      url: 'http://sink.example/hook',
      events: ['resource.*'],
    })
    const secret = subscription.secret

    const app = Fastify()
    // Stub auth: decorate request.tenantId so the emitter is wired.
    app.addHook('preHandler', async (req) => {
      ;(req as unknown as Record<string, unknown>)['tenantId'] = 'tenant-a'
    })
    attachDataStoreContext(app, {
      vertical: 'accounting',
      mode: 'external',
      webhookSubs: subs,
      webhookDeliveries: deliveries,
    })
    app.post('/emit', async (req) => {
      const r = req as unknown as {
        dataStoreEvents?: { emit: (op: string, args: Record<string, unknown>) => void }
      }
      r.dataStoreEvents?.emit('upsert', {
        vertical: 'accounting',
        platform: 'fortnox',
        connectionId: 'conn-1',
        resourceType: 'invoices',
        resourceId: 'inv-1',
        data: { id: 'inv-1', amount: 100 },
        fetchedAt: 1_700_000_000_000,
      })
      return { ok: true }
    })

    const res = await app.inject({ method: 'POST', url: '/emit' })
    expect(res.statusCode).toBe(200)
    await flush()

    // The deliveries store should have one queued row tagged
    // `resource.updated` with a sha256 HMAC of the body using the
    // subscription's secret.
    const all = await deliveries.listForSubscription(subscription.id)
    expect(all.length).toBe(1)
    const row = all[0]!
    expect(row.eventType).toBe('resource.updated')
    expect(row.url).toBe('http://sink.example/hook')

    const raw = (await getDeliveryBody(handle, row.id))!
    const expected = createHmac('sha256', secret).update(raw.body).digest('hex')
    expect(raw.signature).toBe(expected)

    const parsed = JSON.parse(raw.body) as { type: string; data: Record<string, unknown> }
    expect(parsed.type).toBe('resource.updated')
    expect(parsed.data['op']).toBe('upsert')
    expect(parsed.data['resource_id']).toBe('inv-1')

    await app.close()
  })

  it('emit delete fires resource.deleted', async () => {
    const subscription = await subs.create({
      tenantId: 'tenant-a',
      url: 'http://sink.example/hook',
      events: ['resource.deleted'],
    })

    const app = Fastify()
    app.addHook('preHandler', async (req) => {
      ;(req as unknown as Record<string, unknown>)['tenantId'] = 'tenant-a'
    })
    attachDataStoreContext(app, {
      vertical: 'accounting',
      mode: 'external',
      webhookSubs: subs,
      webhookDeliveries: deliveries,
    })
    app.post('/emit', async (req) => {
      const r = req as unknown as {
        dataStoreEvents?: { emit: (op: string, args: Record<string, unknown>) => void }
      }
      r.dataStoreEvents?.emit('delete', {
        vertical: 'accounting',
        platform: 'fortnox',
        connectionId: 'conn-1',
        resourceType: 'invoices',
        resourceId: 'inv-1',
        fetchedAt: 1_700_000_000_000,
      })
      return { ok: true }
    })

    await app.inject({ method: 'POST', url: '/emit' })
    await flush()
    const all = await deliveries.listForSubscription(subscription.id)
    expect(all.length).toBe(1)
    expect(all[0]!.eventType).toBe('resource.deleted')

    await app.close()
  })

  it('database mode does not emit', async () => {
    const subscription = await subs.create({
      tenantId: 'tenant-a',
      url: 'http://sink.example/hook',
      events: ['resource.*'],
    })

    const app = Fastify()
    app.addHook('preHandler', async (req) => {
      ;(req as unknown as Record<string, unknown>)['tenantId'] = 'tenant-a'
    })
    attachDataStoreContext(app, {
      vertical: 'accounting',
      mode: 'database',
      webhookSubs: subs,
      webhookDeliveries: deliveries,
    })
    app.post('/emit', async (req) => {
      const r = req as unknown as { dataStoreEvents?: unknown }
      expect(r.dataStoreEvents).toBeUndefined()
      return { ok: true }
    })

    await app.inject({ method: 'POST', url: '/emit' })
    await flush()
    expect((await deliveries.listForSubscription(subscription.id)).length).toBe(0)

    await app.close()
  })

  it('external mode without tenantId silently skips', async () => {
    const subscription = await subs.create({
      tenantId: 'tenant-a',
      url: 'http://sink.example/hook',
      events: ['resource.*'],
    })

    const app = Fastify()
    // No tenantId decorated.
    attachDataStoreContext(app, {
      vertical: 'accounting',
      mode: 'external',
      webhookSubs: subs,
      webhookDeliveries: deliveries,
    })
    app.post('/emit', async (req) => {
      const r = req as unknown as { dataStoreEvents?: unknown }
      expect(r.dataStoreEvents).toBeUndefined()
      return { ok: true }
    })

    await app.inject({ method: 'POST', url: '/emit' })
    await flush()
    expect((await deliveries.listForSubscription(subscription.id)).length).toBe(0)

    await app.close()
  })
})
