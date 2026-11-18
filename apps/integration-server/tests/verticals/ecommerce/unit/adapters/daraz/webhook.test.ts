import { describe, it, expect } from 'vitest'
import crypto from 'crypto'
import {
  verifyWebhookSignature,
  parseWebhookEvents,
} from '../../../../../../src/verticals/ecommerce/adapters/daraz/webhook'

describe('verifyWebhookSignature (Daraz)', () => {
  const appSecret = 'test-secret-key-12345'

  it('returns true for a valid signature', () => {
    const body = '{"message_type":"product_update","data":{"item_id":123}}'
    const signature = crypto
      .createHmac('sha256', appSecret)
      .update(body)
      .digest('hex')
      .toUpperCase()
    expect(verifyWebhookSignature(body, signature, appSecret)).toBe(true)
  })

  it('returns false for an invalid signature', () => {
    const body = '{"message_type":"product_update"}'
    expect(verifyWebhookSignature(body, 'invalid-signature-000000000000000000000000000000000000000000000000000000000000000', appSecret)).toBe(false)
  })

  it('is case-insensitive for the signature', () => {
    const body = '{"message_type":"order_create"}'
    const signature = crypto
      .createHmac('sha256', appSecret)
      .update(body)
      .digest('hex')
    // Pass lowercase — function uppercases both sides
    expect(verifyWebhookSignature(body, signature, appSecret)).toBe(true)
  })
})

describe('parseWebhookEvents (Daraz)', () => {
  it('parses a product update event', () => {
    const events = parseWebhookEvents({
      message_type: 'product_update',
      data: { item_id: 123456 },
      seller_id: 'S001',
      timestamp: 1700000000,
    })
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      platform: 'daraz',
      type: 'product_update',
      resourceType: 'products',
      action: 'updated',
      resourceId: '123456',
      tenantId: 'S001',
    })
  })

  it('parses a product create event', () => {
    const events = parseWebhookEvents({
      message_type: 'product_create',
      data: { item_id: 789 },
    })
    expect(events[0]!.resourceType).toBe('products')
    expect(events[0]!.action).toBe('created')
  })

  it('parses an order create event', () => {
    const events = parseWebhookEvents({
      message_type: 'order_create',
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
      message_type: 'order_cancel',
      data: { order_id: 9876 },
    })
    expect(events[0]!.resourceType).toBe('orders')
    expect(events[0]!.action).toBe('updated')
  })

  it('parses a stock update event', () => {
    const events = parseWebhookEvents({
      message_type: 'stock_update',
      data: { seller_sku: 'SKU-001' },
    })
    expect(events[0]!.resourceType).toBe('inventory_levels')
    expect(events[0]!.action).toBe('updated')
    expect(events[0]!.resourceId).toBe('SKU-001')
  })

  it('parses a logistics tracking event', () => {
    const events = parseWebhookEvents({
      message_type: 'logistics_tracking_update',
      data: { trade_order_id: 5555 },
    })
    expect(events[0]!.resourceType).toBe('fulfillments')
    expect(events[0]!.action).toBe('updated')
  })

  it('handles unknown message types gracefully', () => {
    const events = parseWebhookEvents({
      message_type: 'completely_unknown',
      data: {},
    })
    expect(events[0]!.resourceType).toBe('unknown')
    expect(events[0]!.action).toBe('unknown')
  })

  it('preserves the full payload in the event', () => {
    const payload = {
      message_type: 'product_delete',
      data: { item_id: 111 },
      extra_field: 'hello',
    }
    const events = parseWebhookEvents(payload)
    expect(events[0]!.payload).toBe(payload)
    expect(events[0]!.resourceType).toBe('products')
    expect(events[0]!.action).toBe('deleted')
  })
})
