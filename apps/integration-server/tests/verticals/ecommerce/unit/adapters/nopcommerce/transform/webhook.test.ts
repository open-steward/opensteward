import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import {
  verifyNopCommerceWebhook,
  parseNopCommerceWebhookEvents,
} from '../../../../../../../src/verticals/ecommerce/adapters/nopcommerce/webhook'

describe('verifyNopCommerceWebhook', () => {
  const secret = 'test-secret-key'

  it('returns true for a valid signature', () => {
    const body = Buffer.from('{"id": 1}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    const headers = { 'x-nop-webhook-signature': sig }
    expect(verifyNopCommerceWebhook(body, headers, secret)).toBe(true)
  })

  it('returns false for an invalid signature', () => {
    const body = Buffer.from('{"id": 1}')
    const headers = { 'x-nop-webhook-signature': 'invalid-sig' }
    expect(verifyNopCommerceWebhook(body, headers, secret)).toBe(false)
  })

  it('returns false when header is missing', () => {
    const body = Buffer.from('{"id": 1}')
    expect(verifyNopCommerceWebhook(body, {}, secret)).toBe(false)
  })
})

describe('parseNopCommerceWebhookEvents', () => {
  it('parses product.created topic', () => {
    const events = parseNopCommerceWebhookEvents({ id: 42 }, 'product.created')
    expect(events).toHaveLength(1)
    expect(events[0]!.platform).toBe('nopcommerce')
    expect(events[0]!.resourceType).toBe('products')
    expect(events[0]!.action).toBe('created')
    expect(events[0]!.resourceId).toBe('42')
  })

  it('parses order.updated topic', () => {
    const events = parseNopCommerceWebhookEvents({ id: 100 }, 'order.updated')
    expect(events[0]!.resourceType).toBe('orders')
    expect(events[0]!.action).toBe('updated')
  })

  it('parses category.deleted topic', () => {
    const events = parseNopCommerceWebhookEvents({ id: 5 }, 'category.deleted')
    expect(events[0]!.resourceType).toBe('collections')
    expect(events[0]!.action).toBe('deleted')
  })

  it('falls back to body event_type', () => {
    const events = parseNopCommerceWebhookEvents(
      { id: 10, event_type: 'customer.created' },
      undefined,
    )
    expect(events[0]!.resourceType).toBe('customers')
    expect(events[0]!.action).toBe('created')
  })

  it('returns unknown for unrecognised topics', () => {
    const events = parseNopCommerceWebhookEvents({ id: 1 }, 'widget.frobnicated')
    expect(events[0]!.resourceType).toBe('unknown')
    expect(events[0]!.action).toBe('unknown')
  })

  it('handles missing topic', () => {
    const events = parseNopCommerceWebhookEvents({ id: 1 })
    expect(events[0]!.resourceType).toBe('unknown')
    expect(events[0]!.action).toBe('unknown')
  })

  it('uses entity_id fallback for resourceId', () => {
    const events = parseNopCommerceWebhookEvents(
      { entity_id: 99 },
      'product.created',
    )
    expect(events[0]!.resourceId).toBe('99')
  })
})
