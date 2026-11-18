import { describe, it, expect, afterEach, vi } from 'vitest'
import { openDb } from '../../src/db'
import type { DbHandle } from '../../src/db'
import { WebhookDeliveryStore, MAX_ATTEMPTS } from '../../src/auth/webhook-deliveries'
import { WebhookRetryWorker } from '../../src/control-plane/webhook-retry-worker'
import { WebhookSubscriptionStore } from '../../src/auth/webhook-subscriptions'

const SECRET = 'test-secret-must-be-at-least-32-chars!'

/**
 * The worker fires `markDelivered`/`markFailed` as fire-and-forget store
 * writes inside its `tick()` — `tick()` resolves before those async store
 * promises settle. Flush a macrotask so the write lands before we assert.
 */
function flush() {
  return new Promise((r) => setTimeout(r, 10))
}

describe('WebhookRetryWorker', () => {
  let handle: DbHandle | undefined
  let deliveries: WebhookDeliveryStore

  afterEach(async () => {
    // The store is a borrower — close the shared handle, not the store.
    await handle?.close()
    handle = undefined
  })

  async function open() {
    handle = await openDb({ sqlitePath: ':memory:' })
    deliveries = await WebhookDeliveryStore.create(handle)
    return deliveries
  }

  function enqueue(overrides?: Partial<{ url: string; eventType: string }>) {
    return deliveries.enqueue({
      subscriptionId: 'sub1',
      eventId: 'evt-' + Math.random().toString(36).slice(2, 10),
      eventType: overrides?.eventType ?? 'customer.created',
      url: overrides?.url ?? 'https://example.test/hook',
      body: '{}',
      signature: 'sha256=abc',
    })
  }

  it('drains pending rows and marks them delivered on 2xx', async () => {
    const s = await open()
    const row = await enqueue()
    const fetchImpl = vi.fn(async () => new Response('ok', { status: 202 })) as unknown as typeof fetch
    const worker = new WebhookRetryWorker({ deliveries: s, fetchImpl })
    await worker.tick()
    await flush()
    const after = (await s.getById(row.id))!
    expect(after.status).toBe('delivered')
    expect(after.lastStatus).toBe(202)
  })

  it('marks failed and reschedules on non-2xx', async () => {
    const s = await open()
    const row = await enqueue()
    const fetchImpl = (async () => new Response('boom', { status: 503 })) as unknown as typeof fetch
    const worker = new WebhookRetryWorker({ deliveries: s, fetchImpl })
    await worker.tick()
    await flush()
    const after = (await s.getById(row.id))!
    expect(after.status).toBe('pending')
    expect(after.attempts).toBe(1)
    expect(after.lastStatus).toBe(503)
    expect(after.nextAttemptAt).toBeGreaterThan(Date.now() + 1_000)
  })

  it('records error when fetch throws', async () => {
    const s = await open()
    const row = await enqueue()
    const fetchImpl = (async () => {
      throw new Error('network unreachable')
    }) as unknown as typeof fetch
    const worker = new WebhookRetryWorker({ deliveries: s, fetchImpl })
    await worker.tick()
    await flush()
    const after = (await s.getById(row.id))!
    expect(after.lastError).toContain('network')
    expect(after.lastStatus).toBeNull()
    expect(after.attempts).toBe(1)
  })

  it('dead-letters after MAX_ATTEMPTS consecutive failures', async () => {
    const s = await open()
    const row = await enqueue()
    const fetchImpl = (async () => new Response('', { status: 500 })) as unknown as typeof fetch
    const worker = new WebhookRetryWorker({ deliveries: s, fetchImpl })
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      // The store schedules next_attempt_at into the future; force eligibility
      // by rewinding it before each tick.
      const cur = await s.getById(row.id)
      if (!cur) break
      // Reset the row so nextBatch picks it up immediately: set
      // next_attempt_at to now-1 via the shared handle's query builder.
      await handle!.kysely
        .updateTable('webhook_deliveries')
        .set({ next_attempt_at: Date.now() - 1 })
        .where('id', '=', row.id)
        .execute()
      await worker.tick()
      // Let the worker's fire-and-forget markFailed/markDelivered settle
      // before the next iteration reads/rewinds the row.
      await flush()
    }
    const after = (await s.getById(row.id))!
    expect(after.status).toBe('dead')
    expect(after.attempts).toBe(MAX_ATTEMPTS)
  })

  describe('custom headers on retry', () => {
    it('reads headers live, so a credential rotated after enqueue is used', async () => {
      // The delivery row is written once at enqueue and replayed for hours.
      // If headers were copied onto it, rotating a receiver credential would
      // never take effect and every remaining retry would keep sending the
      // old one.
      const d = await open()
      const subs = await WebhookSubscriptionStore.create(handle!, SECRET)
      const sub = await subs.create({
        tenantId: 't',
        url: 'https://example.test/hook',
        headers: { 'X-Api-Key': 'old-key' },
      })
      await d.enqueue({
        subscriptionId: sub.id,
        eventId: 'evt-1',
        eventType: 'customer.created',
        url: 'https://example.test/hook',
        body: '{}',
        signature: 'sha256=abc',
      })

      await subs.updateSettings(sub.id, { headers: { 'X-Api-Key': 'new-key' } })

      const seen: Array<Record<string, string>> = []
      const fetchImpl = (async (_url: string, init: RequestInit) => {
        seen.push((init.headers ?? {}) as Record<string, string>)
        return { status: 200 } as Response
      }) as unknown as typeof fetch

      const worker = new WebhookRetryWorker({ deliveries: d, subscriptions: subs, fetchImpl })
      await worker.tick()
      await flush()

      expect(seen).toHaveLength(1)
      expect(seen[0]['X-Api-Key']).toBe('new-key')
    })

    it('still delivers when the subscription has been deleted', async () => {
      const d = await open()
      const subs = await WebhookSubscriptionStore.create(handle!, SECRET)
      await d.enqueue({
        subscriptionId: 'gone',
        eventId: 'evt-2',
        eventType: 'customer.created',
        url: 'https://example.test/hook',
        body: '{}',
        signature: 'sha256=abc',
      })

      const seen: Array<Record<string, string>> = []
      const fetchImpl = (async (_url: string, init: RequestInit) => {
        seen.push((init.headers ?? {}) as Record<string, string>)
        return { status: 200 } as Response
      }) as unknown as typeof fetch

      const worker = new WebhookRetryWorker({ deliveries: d, subscriptions: subs, fetchImpl })
      await worker.tick()
      await flush()

      expect(seen).toHaveLength(1)
      expect(seen[0]['x-oi-event']).toBe('customer.created')
    })
  })
})
