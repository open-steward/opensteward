/**
 * Retention for the two payload stores.
 *
 * `webhook_deliveries.body` carries the full outbound event JSON (customer
 * emails, connection detail); `inbound_events.payload` carries raw platform
 * webhooks. Both are swept by the retry worker per two live-read settings,
 * with 0 = keep forever.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { openDb } from '@opensteward/shared'
import type { DbHandle } from '@opensteward/shared'
import { WebhookDeliveryStore } from '../../src/auth/webhook-deliveries'
import { InboundEventStore } from '../../src/control-plane/inbound-event-store'
import { WebhookRetryWorker } from '../../src/control-plane/webhook-retry-worker'

describe('webhook retention sweep', () => {
  let handle: DbHandle
  let deliveries: WebhookDeliveryStore
  let inboundEvents: InboundEventStore

  beforeEach(async () => {
    handle = await openDb({ sqlitePath: ':memory:' })
    deliveries = await WebhookDeliveryStore.create(handle)
    inboundEvents = await InboundEventStore.create(handle)
  })
  afterEach(async () => {
    await handle?.close()
  })

  async function seedDelivery(status: 'delivered' | 'dead' | 'pending'): Promise<string> {
    const row = await deliveries.enqueue({
      subscriptionId: 'sub1',
      eventId: `evt-${Math.random().toString(36).slice(2)}`,
      eventType: 'customer.created',
      url: 'https://example.test/x',
      body: '{"data":{"email":"jane@acme.example"}}',
      signature: 'sha256=abc',
    })
    if (status === 'delivered') await deliveries.markDelivered(row.id, 200)
    if (status === 'dead') {
      // 410 is non-retryable — one markFailed moves the row straight to dead.
      await deliveries.markFailed(row.id, { status: 410, error: 'gone' })
    }
    return row.id
  }

  it('deleteOlderThan prunes delivered/dead and never pending', async () => {
    const delivered = await seedDelivery('delivered')
    const dead = await seedDelivery('dead')
    const pending = await seedDelivery('pending')

    // Everything was created "now" — a cutoff in the future ages them all out.
    const removed = await deliveries.deleteOlderThan(Date.now() + 60_000)
    expect(removed).toBe(2)
    expect(await deliveries.getById(delivered)).toBeNull()
    expect(await deliveries.getById(dead)).toBeNull()
    expect(await deliveries.getById(pending)).not.toBeNull()
  })

  it('the worker sweeps both stores per the live settings, and 0 keeps forever', async () => {
    await seedDelivery('delivered')
    await inboundEvents.append({
      dedupKey: 'shopify-evt-1',
      tenantId: 'acme',
      vertical: 'ecommerce',
      platform: 'shopify',
      connectionId: null,
      eventType: 'order.created',
      resourceType: 'orders',
      action: 'created',
      resourceId: 'ord_1',
      payload: { order: { email: 'jane@acme.example' } },
    })

    let deliveryDays = 0
    let inboundDays = 0
    const worker = new WebhookRetryWorker({
      deliveries,
      retention: {
        deliveryDays: () => deliveryDays,
        inboundEvents,
        inboundDays: () => inboundDays,
      },
    })

    // 0 = keep forever — the historical behaviour.
    let swept = await worker.sweepRetention()
    expect(swept).toEqual({ deliveries: 0, inbound: 0 })

    // Flip the live values; the next sweep sees them with no restart. The
    // "days" are read at sweep time, so pass a future now to age rows out.
    deliveryDays = 1
    inboundDays = 1
    swept = await worker.sweepRetention(Date.now() + 2 * 86_400_000)
    expect(swept.deliveries).toBe(1)
    expect(swept.inbound).toBe(1)
  })
})
