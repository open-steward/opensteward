import { describe, it, expect } from 'vitest'
import crypto from 'crypto'
import {
  verifyWebhookSignature,
  parseWebhookEvents,
} from '../../../../../../src/verticals/ecommerce/adapters/jumia/webhook'

describe('verifyWebhookSignature (Jumia)', () => {
  const clientSecret = 'jumia-test-secret-key-12345'

  it('returns true for a valid signature', () => {
    const body = '{"event_type":"product.updated","data":{"product_id":123}}'
    const signature = crypto
      .createHmac('sha256', clientSecret)
      .update(body)
      .digest('hex')
    expect(verifyWebhookSignature(body, signature, clientSecret)).toBe(true)
  })

  it('returns false for an invalid signature', () => {
    const body = '{"event_type":"product.updated"}'
    expect(verifyWebhookSignature(body, 'invalid-signature-000000000000000000000000000000000000000000000000000000000000000', clientSecret)).toBe(false)
  })
})

describe('parseWebhookEvents (Jumia)', () => {
  it('parses a product update event', () => {
    const events = parseWebhookEvents({
      event_type: 'product.updated',
      data: { product_id: 123456 },
      seller_id: 'S001',
      timestamp: 1700000000,
    })
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      platform: 'jumia',
      type: 'product.updated',
      resourceType: 'products',
      action: 'updated',
      resourceId: '123456',
      tenantId: 'S001',
    })
  })

  it('parses a product create event', () => {
    const events = parseWebhookEvents({
      event_type: 'product.created',
      data: { product_id: 789 },
    })
    expect(events[0]!.resourceType).toBe('products')
    expect(events[0]!.action).toBe('created')
  })

  it('parses an order create event', () => {
    const events = parseWebhookEvents({
      event_type: 'order.created',
      data: { order_id: 9876 },
    })
    expect(events[0]).toMatchObject({
      resourceType: 'orders',
      action: 'created',
      resourceId: '9876',
    })
  })

  it('parses an order cancellation event', () => {
    const events = parseWebhookEvents({
      event_type: 'order.cancelled',
      data: { order_id: 9876 },
    })
    expect(events[0]!.resourceType).toBe('orders')
    expect(events[0]!.action).toBe('updated')
  })

  it('parses a stock update event', () => {
    const events = parseWebhookEvents({
      event_type: 'stock.updated',
      data: { sku: 'SKU-001' },
    })
    expect(events[0]!.resourceType).toBe('inventory_levels')
    expect(events[0]!.action).toBe('updated')
    expect(events[0]!.resourceId).toBe('SKU-001')
  })

  it('parses a shipment tracking event', () => {
    const events = parseWebhookEvents({
      event_type: 'shipment.tracking_update',
      data: { shipment_id: 'SHIP-001' },
    })
    expect(events[0]!.resourceType).toBe('fulfillments')
    expect(events[0]!.action).toBe('updated')
  })

  it('handles unknown event types gracefully', () => {
    const events = parseWebhookEvents({
      event_type: 'completely_unknown',
      data: {},
    })
    expect(events[0]!.resourceType).toBe('unknown')
    expect(events[0]!.action).toBe('unknown')
  })

  it('preserves the full payload in the event', () => {
    const payload = {
      event_type: 'product.deleted',
      data: { product_id: 111 },
      extra_field: 'hello',
    }
    const events = parseWebhookEvents(payload)
    expect(events[0]!.payload).toBe(payload)
    expect(events[0]!.resourceType).toBe('products')
    expect(events[0]!.action).toBe('deleted')
  })
})
