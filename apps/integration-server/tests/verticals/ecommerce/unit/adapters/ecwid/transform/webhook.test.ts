import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import {
  verifyEcwidWebhook,
  parseEcwidWebhookEvents,
} from '../../../../../../../src/verticals/ecommerce/adapters/ecwid/webhook'

describe('verifyEcwidWebhook', () => {
  it('returns true for a valid HMAC signature', () => {
    const secret = 'test-webhook-secret'
    const body = Buffer.from('{"eventType":"order.updated","entityId":123}')
    const sig = createHmac('sha256', secret).update(body).digest('base64')
    const headers = { 'x-ecwid-webhook-signature': sig }
    expect(verifyEcwidWebhook(body, headers, secret)).toBe(true)
  })

  it('returns false for an invalid signature', () => {
    const body = Buffer.from('{"eventType":"order.updated","entityId":123}')
    const headers = { 'x-ecwid-webhook-signature': 'invalid-sig' }
    expect(verifyEcwidWebhook(body, headers, 'test-secret')).toBe(false)
  })

  it('returns false when signature header is missing', () => {
    const body = Buffer.from('{}')
    expect(verifyEcwidWebhook(body, {}, 'test-secret')).toBe(false)
  })
})

describe('parseEcwidWebhookEvents', () => {
  it('parses product.created event', () => {
    const events = parseEcwidWebhookEvents({
      eventType: 'product.created',
      entityId: 456,
    })
    expect(events).toHaveLength(1)
    expect(events[0]!.platform).toBe('ecwid')
    expect(events[0]!.resourceType).toBe('products')
    expect(events[0]!.action).toBe('created')
    expect(events[0]!.resourceId).toBe('456')
  })

  it('parses order.updated event', () => {
    const events = parseEcwidWebhookEvents({
      eventType: 'order.updated',
      entityId: 789,
    })
    expect(events[0]!.resourceType).toBe('orders')
    expect(events[0]!.action).toBe('updated')
  })

  it('parses discount_coupon.deleted event', () => {
    const events = parseEcwidWebhookEvents({
      eventType: 'discount_coupon.deleted',
      entityId: 'SAVE10',
    })
    expect(events[0]!.resourceType).toBe('discounts')
    expect(events[0]!.action).toBe('deleted')
    expect(events[0]!.resourceId).toBe('SAVE10')
  })

  it('returns unknown for unrecognized event types', () => {
    const events = parseEcwidWebhookEvents({
      eventType: 'weird.thing',
      entityId: 1,
    })
    expect(events[0]!.resourceType).toBe('unknown')
    expect(events[0]!.action).toBe('unknown')
  })

  it('handles missing eventType gracefully', () => {
    const events = parseEcwidWebhookEvents({ id: 1 })
    expect(events).toHaveLength(1)
    expect(events[0]!.resourceType).toBe('unknown')
    expect(events[0]!.action).toBe('unknown')
  })
})
