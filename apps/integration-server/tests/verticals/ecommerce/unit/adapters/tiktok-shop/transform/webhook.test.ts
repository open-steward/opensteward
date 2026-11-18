import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import {
  verifyTikTokShopWebhook,
  parseTikTokShopWebhookEvents,
} from '../../../../../../../src/verticals/ecommerce/adapters/tiktok-shop/webhook'

describe('verifyTikTokShopWebhook', () => {
  const SECRET = 'test-app-secret-12345'

  it('returns true for a valid HMAC-SHA256 signature', () => {
    const body = Buffer.from('{"shop_id":"12345","type":1}')
    const sig = createHmac('sha256', SECRET).update(body).digest('hex')
    const headers = { authorization: sig }
    expect(verifyTikTokShopWebhook(body, headers, SECRET)).toBe(true)
  })

  it('returns false for an invalid signature', () => {
    const body = Buffer.from('{"shop_id":"12345","type":1}')
    const headers = { authorization: 'invalid_signature_here' }
    expect(verifyTikTokShopWebhook(body, headers, SECRET)).toBe(false)
  })

  it('returns false when Authorization header is missing', () => {
    const body = Buffer.from('{"shop_id":"12345"}')
    expect(verifyTikTokShopWebhook(body, {}, SECRET)).toBe(false)
  })

  it('returns false for tampered body', () => {
    const original = Buffer.from('{"shop_id":"12345","type":1}')
    const sig = createHmac('sha256', SECRET).update(original).digest('hex')
    const tampered = Buffer.from('{"shop_id":"99999","type":1}')
    expect(verifyTikTokShopWebhook(tampered, { authorization: sig }, SECRET)).toBe(false)
  })

  it('handles capital-A Authorization header', () => {
    const body = Buffer.from('{"test":true}')
    const sig = createHmac('sha256', SECRET).update(body).digest('hex')
    expect(verifyTikTokShopWebhook(body, { Authorization: sig }, SECRET)).toBe(true)
  })
})

describe('parseTikTokShopWebhookEvents', () => {
  it('parses an order status update (type 1)', () => {
    const events = parseTikTokShopWebhookEvents({
      shop_id: '12345',
      type: 1,
      data: { order_id: 'TTS240501ABCDE' },
      timestamp: 1714560000,
    })
    expect(events).toHaveLength(1)
    expect(events[0]!.platform).toBe('tiktok-shop')
    expect(events[0]!.resourceType).toBe('orders')
    expect(events[0]!.action).toBe('updated')
    expect(events[0]!.type).toBe('orders.updated')
    expect(events[0]!.resourceId).toBe('TTS240501ABCDE')
    expect(events[0]!.tenantId).toBe('12345')
  })

  it('parses a package update (type 2)', () => {
    const events = parseTikTokShopWebhookEvents({
      shop_id: '12345',
      type: 2,
      data: { package_id: 'PKG-001' },
    })
    expect(events[0]!.resourceType).toBe('fulfillments')
    expect(events[0]!.action).toBe('updated')
    expect(events[0]!.resourceId).toBe('PKG-001')
  })

  it('parses product status change (type 3)', () => {
    const events = parseTikTokShopWebhookEvents({
      shop_id: '12345',
      type: 3,
      data: { product_id: 'PROD-001' },
    })
    expect(events[0]!.resourceType).toBe('products')
    expect(events[0]!.resourceId).toBe('PROD-001')
  })

  it('parses return/refund event (type 4)', () => {
    const events = parseTikTokShopWebhookEvents({
      shop_id: '12345',
      type: 4,
      data: { order_id: 'ORD-001' },
    })
    expect(events[0]!.resourceType).toBe('refunds')
    expect(events[0]!.action).toBe('created')
  })

  it('parses promotion change (type 6)', () => {
    const events = parseTikTokShopWebhookEvents({
      shop_id: '12345',
      type: 6,
      data: {},
    })
    expect(events[0]!.resourceType).toBe('discounts')
  })

  it('returns unknown for unrecognized event types', () => {
    const events = parseTikTokShopWebhookEvents({
      shop_id: '12345',
      type: 99,
      data: {},
    })
    expect(events[0]!.resourceType).toBe('unknown')
    expect(events[0]!.action).toBe('unknown')
  })

  it('handles missing type gracefully', () => {
    const events = parseTikTokShopWebhookEvents({ shop_id: '12345', data: {} })
    expect(events[0]!.resourceType).toBe('unknown')
  })

  it('handles numeric shop_id', () => {
    const events = parseTikTokShopWebhookEvents({
      shop_id: 12345,
      type: 1,
      data: { order_id: 'ORD-001' },
    })
    expect(events[0]!.tenantId).toBe('12345')
  })
})
