import { describe, it, expect } from 'vitest'
import crypto from 'crypto'
import {
  verifyJdWebhook,
  parseJdWebhookEvents,
} from '../../../../../../../src/verticals/ecommerce/adapters/jdcom/webhook'

describe('verifyJdWebhook', () => {
  const SECRET = 'test-app-secret-12345'

  it('returns true for a valid MD5 signature', () => {
    const body = Buffer.from('{"type":1,"id":"msg_001"}')
    const sig = crypto
      .createHash('md5')
      .update(body.toString('utf8') + SECRET)
      .digest('hex')
      .toUpperCase()
    const headers = { 'x-jd-sign': sig }
    expect(verifyJdWebhook(body, headers, SECRET)).toBe(true)
  })

  it('returns false for an invalid signature', () => {
    const body = Buffer.from('{"type":1,"id":"msg_001"}')
    const headers = { 'x-jd-sign': 'INVALID_SIGNATURE_HERE_1234567890AB' }
    expect(verifyJdWebhook(body, headers, SECRET)).toBe(false)
  })

  it('returns false when x-jd-sign header is missing', () => {
    const body = Buffer.from('{"type":1}')
    expect(verifyJdWebhook(body, {}, SECRET)).toBe(false)
  })

  it('returns false for tampered body', () => {
    const original = Buffer.from('{"type":1,"id":"msg_001"}')
    const sig = crypto
      .createHash('md5')
      .update(original.toString('utf8') + SECRET)
      .digest('hex')
      .toUpperCase()
    const tampered = Buffer.from('{"type":2,"id":"msg_001"}')
    expect(verifyJdWebhook(tampered, { 'x-jd-sign': sig }, SECRET)).toBe(false)
  })

  it('handles capital-letter header name', () => {
    const body = Buffer.from('{"test":true}')
    const sig = crypto
      .createHash('md5')
      .update(body.toString('utf8') + SECRET)
      .digest('hex')
      .toUpperCase()
    expect(verifyJdWebhook(body, { 'X-Jd-Sign': sig }, SECRET)).toBe(true)
  })

  it('is case-insensitive on signature comparison', () => {
    const body = Buffer.from('{"type":1}')
    const sig = crypto
      .createHash('md5')
      .update(body.toString('utf8') + SECRET)
      .digest('hex')
      .toLowerCase() // lowercase
    expect(verifyJdWebhook(body, { 'x-jd-sign': sig }, SECRET)).toBe(true)
  })
})

describe('parseJdWebhookEvents', () => {
  it('parses an order created event (type 1)', () => {
    const events = parseJdWebhookEvents({
      type: 1,
      id: 'msg_001',
      content: { order_id: 'JD2024010100001' },
      time: '2024-01-01 10:00:00',
    })
    expect(events).toHaveLength(1)
    expect(events[0]!.platform).toBe('jdcom')
    expect(events[0]!.resourceType).toBe('orders')
    expect(events[0]!.action).toBe('created')
    expect(events[0]!.type).toBe('orders.created')
    expect(events[0]!.resourceId).toBe('JD2024010100001')
    expect(events[0]!.id).toBe('msg_001')
  })

  it('parses an order paid event (type 2)', () => {
    const events = parseJdWebhookEvents({
      type: 2,
      content: { order_id: 'JD2024010100001' },
    })
    expect(events[0]!.resourceType).toBe('orders')
    expect(events[0]!.action).toBe('updated')
  })

  it('parses an order shipped event (type 3)', () => {
    const events = parseJdWebhookEvents({
      type: 3,
      content: { order_id: 'JD2024010100001' },
    })
    expect(events[0]!.resourceType).toBe('fulfillments')
    expect(events[0]!.action).toBe('updated')
  })

  it('parses an order completed event (type 4)', () => {
    const events = parseJdWebhookEvents({
      type: 4,
      content: { order_id: 'JD2024010100001' },
    })
    expect(events[0]!.resourceType).toBe('orders')
    expect(events[0]!.action).toBe('updated')
  })

  it('parses an order cancelled event (type 5)', () => {
    const events = parseJdWebhookEvents({
      type: 5,
      content: { order_id: 'JD2024010100001' },
    })
    expect(events[0]!.resourceType).toBe('orders')
    expect(events[0]!.action).toBe('updated')
  })

  it('parses product status change (type 10)', () => {
    const events = parseJdWebhookEvents({
      type: 10,
      content: { sku_id: '10086001' },
    })
    expect(events[0]!.resourceType).toBe('products')
    expect(events[0]!.resourceId).toBe('10086001')
  })

  it('parses stock change (type 11)', () => {
    const events = parseJdWebhookEvents({
      type: 11,
      content: { sku_id: '10086001' },
    })
    expect(events[0]!.resourceType).toBe('inventory_levels')
    expect(events[0]!.resourceId).toBe('10086001')
  })

  it('parses price change (type 12)', () => {
    const events = parseJdWebhookEvents({
      type: 12,
      content: { ware_id: '50001' },
    })
    expect(events[0]!.resourceType).toBe('products')
    expect(events[0]!.resourceId).toBe('50001')
  })

  it('returns unknown for unrecognized message types', () => {
    const events = parseJdWebhookEvents({ type: 99, content: {} })
    expect(events[0]!.resourceType).toBe('unknown')
    expect(events[0]!.action).toBe('unknown')
  })

  it('handles missing type gracefully', () => {
    const events = parseJdWebhookEvents({ content: {} })
    expect(events[0]!.resourceType).toBe('unknown')
  })

  it('handles string content (JSON)', () => {
    const events = parseJdWebhookEvents({
      type: 1,
      content: '{"order_id":"JD123"}',
    })
    expect(events[0]!.resourceId).toBe('JD123')
  })

  it('handles invalid JSON string content gracefully', () => {
    const events = parseJdWebhookEvents({
      type: 1,
      content: 'not-json',
    })
    expect(events[0]!.resourceId).toBe('')
  })

  it('uses orderId as fallback for resourceId', () => {
    const events = parseJdWebhookEvents({
      type: 1,
      content: { orderId: 'ALT-ORDER-123' },
    })
    expect(events[0]!.resourceId).toBe('ALT-ORDER-123')
  })
})
