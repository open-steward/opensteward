import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import {
  verifyTokopediaWebhook,
  parseTokopediaWebhookEvents,
} from '../../../../../../../src/verticals/ecommerce/adapters/tokopedia/webhook'

describe('verifyTokopediaWebhook', () => {
  const SECRET = 'test-app-secret-12345'

  it('returns true for a valid HMAC-SHA256 signature', () => {
    const body = Buffer.from('{"fs_id":12345,"type":"order_notification"}')
    const sig = createHmac('sha256', SECRET).update(body).digest('hex')
    const headers = { 'x-tokopedia-hmac-sha256': sig }
    expect(verifyTokopediaWebhook(body, headers, SECRET)).toBe(true)
  })

  it('returns false for an invalid signature', () => {
    const body = Buffer.from('{"fs_id":12345,"type":"order_notification"}')
    const headers = { 'x-tokopedia-hmac-sha256': 'invalid_signature_here' }
    expect(verifyTokopediaWebhook(body, headers, SECRET)).toBe(false)
  })

  it('returns false when signature header is missing', () => {
    const body = Buffer.from('{"fs_id":12345}')
    expect(verifyTokopediaWebhook(body, {}, SECRET)).toBe(false)
  })

  it('returns false for tampered body', () => {
    const original = Buffer.from('{"fs_id":12345,"type":"order_notification"}')
    const sig = createHmac('sha256', SECRET).update(original).digest('hex')
    const tampered = Buffer.from('{"fs_id":99999,"type":"order_notification"}')
    expect(verifyTokopediaWebhook(tampered, { 'x-tokopedia-hmac-sha256': sig }, SECRET)).toBe(false)
  })

  it('handles capital header variant', () => {
    const body = Buffer.from('{"test":true}')
    const sig = createHmac('sha256', SECRET).update(body).digest('hex')
    expect(verifyTokopediaWebhook(body, { 'X-Tokopedia-Hmac-SHA256': sig }, SECRET)).toBe(true)
  })
})

describe('parseTokopediaWebhookEvents', () => {
  it('parses an order notification', () => {
    const events = parseTokopediaWebhookEvents({
      fs_id: 12345,
      type: 'order_notification',
      shop_id: 67890,
      data: { order_id: 123456789 },
    })
    expect(events).toHaveLength(1)
    expect(events[0]!.platform).toBe('tokopedia')
    expect(events[0]!.resourceType).toBe('orders')
    expect(events[0]!.action).toBe('updated')
    expect(events[0]!.type).toBe('orders.updated')
    expect(events[0]!.resourceId).toBe('123456789')
    expect(events[0]!.tenantId).toBe('67890')
  })

  it('parses a product notification', () => {
    const events = parseTokopediaWebhookEvents({
      fs_id: 12345,
      type: 'product_notification',
      shop_id: 67890,
      data: { product_id: 987654321 },
    })
    expect(events[0]!.resourceType).toBe('products')
    expect(events[0]!.action).toBe('updated')
    expect(events[0]!.resourceId).toBe('987654321')
  })

  it('parses a stock notification', () => {
    const events = parseTokopediaWebhookEvents({
      fs_id: 12345,
      type: 'stock_notification',
      shop_id: 67890,
      data: { product_id: 987654321 },
    })
    expect(events[0]!.resourceType).toBe('inventory_levels')
    expect(events[0]!.action).toBe('updated')
  })

  it('parses a shipping notification', () => {
    const events = parseTokopediaWebhookEvents({
      fs_id: 12345,
      type: 'shipping_notification',
      shop_id: 67890,
      data: { order_id: 123456789 },
    })
    expect(events[0]!.resourceType).toBe('fulfillments')
    expect(events[0]!.action).toBe('updated')
  })

  it('parses a product creation event', () => {
    const events = parseTokopediaWebhookEvents({
      fs_id: 12345,
      type: 'product_creation',
      shop_id: 67890,
      data: { product_id: 111222333 },
    })
    expect(events[0]!.resourceType).toBe('products')
    expect(events[0]!.action).toBe('created')
    expect(events[0]!.type).toBe('products.created')
  })

  it('returns unknown for unrecognized event types', () => {
    const events = parseTokopediaWebhookEvents({
      fs_id: 12345,
      type: 'mystery_event',
      shop_id: 67890,
      data: {},
    })
    expect(events[0]!.resourceType).toBe('unknown')
    expect(events[0]!.action).toBe('unknown')
  })

  it('handles missing type gracefully', () => {
    const events = parseTokopediaWebhookEvents({ fs_id: 12345, data: {} })
    expect(events[0]!.resourceType).toBe('unknown')
  })

  it('falls back to fs_id as tenantId when shop_id is missing', () => {
    const events = parseTokopediaWebhookEvents({
      fs_id: 12345,
      type: 'order_notification',
      data: { order_id: 1 },
    })
    expect(events[0]!.tenantId).toBe('12345')
  })

  it('prefers order_id over product_id for resourceId', () => {
    const events = parseTokopediaWebhookEvents({
      fs_id: 12345,
      type: 'order_notification',
      data: { order_id: 111, product_id: 222 },
    })
    expect(events[0]!.resourceId).toBe('111')
  })
})
