import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import {
  verifyShopeeWebhook,
  parseShopeeWebhookEvents,
} from '../../../../../../../src/verticals/ecommerce/adapters/shopee/webhook'

describe('verifyShopeeWebhook', () => {
  const SECRET = 'test-partner-key-12345'

  it('returns true for a valid HMAC-SHA256 signature', () => {
    const body = Buffer.from('{"shop_id":12345,"code":3}')
    const sig = createHmac('sha256', SECRET).update(body).digest('hex')
    const headers = { authorization: sig }
    expect(verifyShopeeWebhook(body, headers, SECRET)).toBe(true)
  })

  it('returns false for an invalid signature', () => {
    const body = Buffer.from('{"shop_id":12345,"code":3}')
    const headers = { authorization: 'invalid_signature_here' }
    expect(verifyShopeeWebhook(body, headers, SECRET)).toBe(false)
  })

  it('returns false when Authorization header is missing', () => {
    const body = Buffer.from('{"shop_id":12345}')
    expect(verifyShopeeWebhook(body, {}, SECRET)).toBe(false)
  })

  it('returns false for tampered body', () => {
    const original = Buffer.from('{"shop_id":12345,"code":3}')
    const sig = createHmac('sha256', SECRET).update(original).digest('hex')
    const tampered = Buffer.from('{"shop_id":99999,"code":3}')
    expect(verifyShopeeWebhook(tampered, { authorization: sig }, SECRET)).toBe(false)
  })

  it('handles capital-A Authorization header', () => {
    const body = Buffer.from('{"test":true}')
    const sig = createHmac('sha256', SECRET).update(body).digest('hex')
    expect(verifyShopeeWebhook(body, { Authorization: sig }, SECRET)).toBe(true)
  })
})

describe('parseShopeeWebhookEvents', () => {
  it('parses an order status update (code 3)', () => {
    const events = parseShopeeWebhookEvents({
      shop_id: 12345,
      code: 3,
      data: { ordersn: 'SG240501ABCDE' },
      timestamp: 1714560000,
    })
    expect(events).toHaveLength(1)
    expect(events[0]!.platform).toBe('shopee')
    expect(events[0]!.resourceType).toBe('orders')
    expect(events[0]!.action).toBe('updated')
    expect(events[0]!.type).toBe('orders.updated')
    expect(events[0]!.resourceId).toBe('SG240501ABCDE')
    expect(events[0]!.tenantId).toBe('12345')
  })

  it('parses a tracking update (code 4)', () => {
    const events = parseShopeeWebhookEvents({
      shop_id: 12345,
      code: 4,
      data: { ordersn: 'SG240501ABCDE' },
    })
    expect(events[0]!.resourceType).toBe('fulfillments')
    expect(events[0]!.action).toBe('updated')
  })

  it('parses item update (code 5)', () => {
    const events = parseShopeeWebhookEvents({
      shop_id: 12345,
      code: 5,
      data: { item_id: 100200300 },
    })
    expect(events[0]!.resourceType).toBe('products')
    expect(events[0]!.resourceId).toBe('100200300')
  })

  it('parses promotion update (code 7)', () => {
    const events = parseShopeeWebhookEvents({
      shop_id: 12345,
      code: 7,
      data: {},
    })
    expect(events[0]!.resourceType).toBe('discounts')
  })

  it('parses stock change (code 8)', () => {
    const events = parseShopeeWebhookEvents({
      shop_id: 12345,
      code: 8,
      data: { item_id: 100200300 },
    })
    expect(events[0]!.resourceType).toBe('inventory_levels')
    expect(events[0]!.resourceId).toBe('100200300')
  })

  it('returns unknown for unrecognized push codes', () => {
    const events = parseShopeeWebhookEvents({
      shop_id: 12345,
      code: 99,
      data: {},
    })
    expect(events[0]!.resourceType).toBe('unknown')
    expect(events[0]!.action).toBe('unknown')
  })

  it('handles missing code gracefully', () => {
    const events = parseShopeeWebhookEvents({ shop_id: 12345, data: {} })
    expect(events[0]!.resourceType).toBe('unknown')
  })

  it('uses order_sn as fallback for resourceId', () => {
    const events = parseShopeeWebhookEvents({
      shop_id: 12345,
      code: 3,
      data: { order_sn: 'ALT-ORDER-123' },
    })
    expect(events[0]!.resourceId).toBe('ALT-ORDER-123')
  })
})
