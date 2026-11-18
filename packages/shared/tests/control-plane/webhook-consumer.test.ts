import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { openDb } from '../../src/db'
import type { DbHandle } from '../../src/db'
import { CredentialStore } from '../../src/auth/store'
import { WebhookSubscriptionStore } from '../../src/auth/webhook-subscriptions'
import { WebhookDeliveryStore } from '../../src/auth/webhook-deliveries'
import { InboundEventStore } from '../../src/control-plane/inbound-event-store'
import { createWebhookConsumer } from '../../src/control-plane/webhook-consumer'

const SECRET = 'consumer-test-secret-must-be-32-chars-long'

describe('createWebhookConsumer', () => {
  let handle: DbHandle
  let store: CredentialStore
  let subs: WebhookSubscriptionStore
  let deliveries: WebhookDeliveryStore
  let inboundEvents: InboundEventStore
  let connectionId: string
  const origFetch = global.fetch

  beforeEach(async () => {
    handle = await openDb({ sqlitePath: ':memory:' })
    store = await CredentialStore.create(handle, SECRET)
    subs = await WebhookSubscriptionStore.create(handle, SECRET)
    deliveries = await WebhookDeliveryStore.create(handle)
    inboundEvents = await InboundEventStore.create(handle)
    // owner tenant 'owner1' owns the connection
    connectionId = await store.create(
      'stripe',
      'cust1',
      { accessToken: 'a' },
      null,
      'payments',
      'owner1',
    )
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 }) as unknown as typeof fetch
  })
  afterEach(async () => {
    global.fetch = origFetch
    await handle?.close()
  })

  const input = (over?: Record<string, unknown>) => ({
    vertical: 'payments',
    platform: 'stripe',
    connectionId,
    event: {
      type: 'charge.succeeded',
      resourceType: 'charges',
      action: 'succeeded',
      resourceId: 'ch_1',
      id: 'evt_1',
      payload: { id: 'ch_1' },
      ...(over ?? {}),
    },
    rawBody: Buffer.from('{}'),
  })

  it('appends to the stream and bridges to a matching subscription', async () => {
    const sub = await subs.create({
      tenantId: 'owner1',
      url: 'https://x.test/hook',
      events: ['platform.event'],
    })
    const consumer = createWebhookConsumer({ store, subs, deliveries, inboundEvents })

    await consumer.consume(input())
    await new Promise((r) => setTimeout(r, 20)) // let the fire-and-forget emit settle

    const events = await inboundEvents.listForTenant('owner1')
    expect(events).toHaveLength(1)
    expect(events[0]!.eventType).toBe('charge.succeeded')

    const queued = await deliveries.listForSubscription(sub.id)
    expect(queued.length).toBeGreaterThanOrEqual(1)
    expect(queued[0]!.eventType).toBe('platform.event')
  })

  it('is idempotent: a duplicate delivery appends + emits once', async () => {
    const sub = await subs.create({ tenantId: 'owner1', url: 'https://x.test/hook', events: ['*'] })
    const consumer = createWebhookConsumer({ store, subs, deliveries, inboundEvents })

    await consumer.consume(input())
    await consumer.consume(input()) // same event id → deduped
    await new Promise((r) => setTimeout(r, 20))

    expect(await inboundEvents.listForTenant('owner1')).toHaveLength(1)
    const queued = await deliveries.listForSubscription(sub.id)
    expect(queued).toHaveLength(1)
  })

  it('still records the event when there is no subscription (no bridge)', async () => {
    const consumer = createWebhookConsumer({ store, subs, deliveries, inboundEvents })
    await consumer.consume(input())
    expect(await inboundEvents.listForTenant('owner1')).toHaveLength(1)
  })

  it('binds an unauthenticated body into the dedup key', async () => {
    // A forged body reusing a real event id must not swallow the genuine
    // delivery; an exact redelivery of the same bytes still dedupes.
    const consumer = createWebhookConsumer({ store, subs, deliveries, inboundEvents })
    const unauth = (body: string) => ({
      ...input(),
      rawBody: Buffer.from(body),
      bodyAuthenticated: false as const,
    })
    await consumer.consume(unauth('{"forged":true}'))
    await consumer.consume(unauth('{"real":true}'))
    await consumer.consume(unauth('{"real":true}'))
    expect(await inboundEvents.listForTenant('owner1')).toHaveLength(2)
  })

  it('invokes the injected cache-refresh hook on first sight only', async () => {
    const refreshResource = vi.fn().mockResolvedValue(undefined)
    const consumer = createWebhookConsumer({
      store,
      subs,
      deliveries,
      inboundEvents,
      refreshResource,
    })
    await consumer.consume(input())
    await consumer.consume(input())
    await new Promise((r) => setTimeout(r, 20))
    expect(refreshResource).toHaveBeenCalledTimes(1)
    expect(refreshResource).toHaveBeenCalledWith(
      expect.objectContaining({ resourceType: 'charges', resourceId: 'ch_1', tenantId: 'owner1' }),
    )
  })

  it('tells the cache-refresh hook when the body was not authenticated, and only then', async () => {
    const refreshResource = vi.fn().mockResolvedValue(undefined)
    const consumer = createWebhookConsumer({
      store,
      subs,
      deliveries,
      inboundEvents,
      refreshResource,
    })
    await consumer.consume({ ...input({ id: 'evt_a' }), bodyAuthenticated: false })
    await consumer.consume(input({ id: 'evt_b' }))
    await new Promise((r) => setTimeout(r, 20))
    expect(refreshResource).toHaveBeenCalledTimes(2)
    expect(refreshResource.mock.calls[0]![0]).toMatchObject({ bodyAuthenticated: false })
    expect(refreshResource.mock.calls[1]![0]).not.toHaveProperty('bodyAuthenticated')
  })
})
