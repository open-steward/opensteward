import { describe, it, expect } from 'vitest'
import crypto from 'crypto'
import {
  verifyWebhookSignature,
  parseWebhookEvents,
} from '../../../../../../src/verticals/ecommerce/adapters/noon/webhook'

describe('verifyWebhookSignature (Noon)', () => {
  const secret = 'noon-webhook-secret-12345'

  it('returns true for a valid signature', () => {
    const body = '{"event_type":"product.updated","data":{"product_id":"NP-123"}}'
    const signature = crypto
      .createHmac('sha256', secret)
      .update(body)
      .digest('hex')
    expect(verifyWebhookSignature(body, signature, secret)).toBe(true)
  })

  it('returns false for an invalid signature', () => {
    const body = '{"event_type":"product.updated"}'
    expect(
      verifyWebhookSignature(
        body,
        'invalid-signature-000000000000000000000000000000000000000000000000000000000000000',
        secret,
      ),
    ).toBe(false)
  })

  it('rejects tampered body', () => {
    const body = '{"event_type":"order.created"}'
    const signature = crypto
      .createHmac('sha256', secret)
      .update(body)
      .digest('hex')
    expect(verifyWebhookSignature(body + ' ', signature, secret)).toBe(false)
  })
})

describe('parseWebhookEvents (Noon)', () => {
  it('parses a product update event', () => {
    const events = parseWebhookEvents({
      event_type: 'product.updated',
      data: { product_id: 'NP-12345' },
      seller_id: 'S001',
      timestamp: 1700000000,
      event_id: 'EVT-001',
    })
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      platform: 'noon',
      type: 'product.updated',
      resourceType: 'products',
      action: 'updated',
      resourceId: 'NP-12345',
      tenantId: 'S001',
      id: 'EVT-001',
    })
  })

  it('parses a product create event', () => {
    const events = parseWebhookEvents({
      event_type: 'product.created',
      data: { product_id: 'NP-789' },
    })
    expect(events[0]!.resourceType).toBe('products')
    expect(events[0]!.action).toBe('created')
  })

  it('parses a product delete event', () => {
    const events = parseWebhookEvents({
      event_type: 'product.deleted',
      data: { product_id: 'NP-111' },
    })
    expect(events[0]!.resourceType).toBe('products')
    expect(events[0]!.action).toBe('deleted')
  })

  it('parses an order create event', () => {
    const events = parseWebhookEvents({
      event_type: 'order.created',
      data: { order_id: 'ORD-9876' },
    })
    expect(events[0]).toMatchObject({
      resourceType: 'orders',
      action: 'created',
      resourceId: 'ORD-9876',
    })
  })

  it('parses an order cancellation event', () => {
    const events = parseWebhookEvents({
      event_type: 'order.cancelled',
      data: { order_id: 'ORD-9876' },
    })
    expect(events[0]!.resourceType).toBe('orders')
    expect(events[0]!.action).toBe('updated')
  })

  it('parses an inventory update event', () => {
    const events = parseWebhookEvents({
      event_type: 'inventory.updated',
      data: { sku: 'SKU-001' },
    })
    expect(events[0]!.resourceType).toBe('inventory_levels')
    expect(events[0]!.action).toBe('updated')
    expect(events[0]!.resourceId).toBe('SKU-001')
  })

  it('parses a fulfillment/shipment event', () => {
    const events = parseWebhookEvents({
      event_type: 'shipment.tracking_update',
      data: { fulfillment_id: 'FF-5001' },
    })
    expect(events[0]!.resourceType).toBe('fulfillments')
    expect(events[0]!.action).toBe('updated')
  })

  it('parses a customer event', () => {
    const events = parseWebhookEvents({
      event_type: 'customer.created',
      data: { customer_id: 'CUST-001' },
    })
    expect(events[0]!.resourceType).toBe('customers')
    expect(events[0]!.action).toBe('created')
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
      data: { product_id: 'NP-111' },
      extra_field: 'marhaba',
    }
    const events = parseWebhookEvents(payload)
    expect(events[0]!.payload).toBe(payload)
  })

  it('uses event_id as the event id when present', () => {
    const events = parseWebhookEvents({
      event_type: 'order.updated',
      data: { order_id: 'ORD-1' },
      event_id: 'EVT-42',
      timestamp: 1700000000,
    })
    expect(events[0]!.id).toBe('EVT-42')
  })

  it('falls back to timestamp as event id when event_id is absent', () => {
    const events = parseWebhookEvents({
      event_type: 'order.updated',
      data: { order_id: 'ORD-1' },
      timestamp: 1700000000,
    })
    expect(events[0]!.id).toBe('1700000000')
  })
})
