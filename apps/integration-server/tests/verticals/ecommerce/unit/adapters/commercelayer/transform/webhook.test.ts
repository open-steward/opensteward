import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import {
  verifyCLWebhook,
  parseCLWebhookEvents,
} from '../../../../../../../src/verticals/ecommerce/adapters/commercelayer/webhook'

describe('verifyCLWebhook', () => {
  const secret = 'test-webhook-secret'

  function sign(payload: string): string {
    return createHmac('sha256', secret).update(Buffer.from(payload)).digest('hex')
  }

  it('returns true for valid signature', () => {
    const body = '{"data":{"id":"order-001","type":"orders"}}'
    const sig = sign(body)
    const result = verifyCLWebhook(
      Buffer.from(body),
      { 'x-commercelayer-signature': sig },
      secret,
    )
    expect(result).toBe(true)
  })

  it('returns false for invalid signature', () => {
    const body = '{"data":{"id":"order-001"}}'
    const result = verifyCLWebhook(
      Buffer.from(body),
      { 'x-commercelayer-signature': 'bad-signature' },
      secret,
    )
    expect(result).toBe(false)
  })

  it('returns false when header is missing', () => {
    const body = '{"data":{"id":"order-001"}}'
    const result = verifyCLWebhook(Buffer.from(body), {}, secret)
    expect(result).toBe(false)
  })

  it('handles case-sensitive header lookup', () => {
    const body = '{"data":{"id":"order-001"}}'
    const sig = sign(body)
    const result = verifyCLWebhook(
      Buffer.from(body),
      { 'X-CommerceLayer-Signature': sig },
      secret,
    )
    expect(result).toBe(true)
  })
})

describe('parseCLWebhookEvents', () => {
  it('parses an orders.create event', () => {
    const events = parseCLWebhookEvents({
      topic: 'orders.create',
      data: { id: 'order-001', type: 'orders' },
    })
    expect(events).toHaveLength(1)
    expect(events[0]!.platform).toBe('commercelayer')
    expect(events[0]!.resourceType).toBe('orders')
    expect(events[0]!.action).toBe('created')
    expect(events[0]!.resourceId).toBe('order-001')
  })

  it('parses a skus.update event', () => {
    const events = parseCLWebhookEvents({
      topic: 'skus.update',
      data: { id: 'sku-001', type: 'skus' },
    })
    expect(events[0]!.resourceType).toBe('products')
    expect(events[0]!.action).toBe('updated')
  })

  it('parses a customers.destroy event', () => {
    const events = parseCLWebhookEvents({
      topic: 'customers.destroy',
      data: { id: 'cust-001', type: 'customers' },
    })
    expect(events[0]!.resourceType).toBe('customers')
    expect(events[0]!.action).toBe('deleted')
  })

  it('maps shipments to fulfillments', () => {
    const events = parseCLWebhookEvents({
      topic: 'shipments.update',
      data: { id: 'ship-001', type: 'shipments' },
    })
    expect(events[0]!.resourceType).toBe('fulfillments')
    expect(events[0]!.action).toBe('updated')
  })

  it('maps returns to refunds', () => {
    const events = parseCLWebhookEvents({
      topic: 'returns.create',
      data: { id: 'ret-001', type: 'returns' },
    })
    expect(events[0]!.resourceType).toBe('refunds')
  })

  it('maps captures to transactions', () => {
    const events = parseCLWebhookEvents({
      topic: 'captures.create',
      data: { id: 'cap-001', type: 'captures' },
    })
    expect(events[0]!.resourceType).toBe('transactions')
  })

  it('maps promotions to discounts', () => {
    const events = parseCLWebhookEvents({
      topic: 'promotions.create',
      data: { id: 'promo-001', type: 'promotions' },
    })
    expect(events[0]!.resourceType).toBe('discounts')
  })

  it('maps stock_items to inventory_levels', () => {
    const events = parseCLWebhookEvents({
      topic: 'stock_items.update',
      data: { id: 'si-001', type: 'stock_items' },
    })
    expect(events[0]!.resourceType).toBe('inventory_levels')
  })

  it('maps sku_lists to collections', () => {
    const events = parseCLWebhookEvents({
      topic: 'sku_lists.create',
      data: { id: 'sl-001', type: 'sku_lists' },
    })
    expect(events[0]!.resourceType).toBe('collections')
  })

  it('handles unknown topic', () => {
    const events = parseCLWebhookEvents({
      topic: 'unknown_resource.unknown_action',
      data: { id: 'x' },
    })
    expect(events[0]!.resourceType).toBe('unknown')
    expect(events[0]!.action).toBe('unknown')
  })

  it('handles missing topic', () => {
    const events = parseCLWebhookEvents({
      data: { id: 'x' },
    })
    expect(events[0]!.resourceType).toBe('unknown')
    expect(events[0]!.action).toBe('unknown')
  })

  it('preserves the full payload', () => {
    const payload = { topic: 'orders.create', data: { id: 'o1' }, extra: 'value' }
    const events = parseCLWebhookEvents(payload)
    expect(events[0]!.payload).toBe(payload)
  })
})
