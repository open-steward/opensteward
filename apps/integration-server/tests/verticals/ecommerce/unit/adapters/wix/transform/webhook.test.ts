import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyWixWebhook, parseWixWebhookEvents } from '../../../../../../../src/verticals/ecommerce/adapters/wix/webhook'

describe('verifyWixWebhook', () => {
  const secret = 'test-webhook-secret'

  it('returns true for valid signature', () => {
    const body = Buffer.from('{"test": true}')
    const sig = createHmac('sha256', secret).update(body).digest('base64')
    expect(verifyWixWebhook(body, { 'x-wix-signature': sig }, secret)).toBe(true)
  })

  it('returns false for invalid signature', () => {
    const body = Buffer.from('{"test": true}')
    expect(verifyWixWebhook(body, { 'x-wix-signature': 'invalid' }, secret)).toBe(false)
  })

  it('returns false when signature header is missing', () => {
    const body = Buffer.from('{"test": true}')
    expect(verifyWixWebhook(body, {}, secret)).toBe(false)
  })
})

describe('parseWixWebhookEvents', () => {
  it('parses product_created event type', () => {
    const events = parseWixWebhookEvents(
      { data: { id: 'prod-001' } },
      'wix.stores.product_created',
    )
    expect(events).toHaveLength(1)
    expect(events[0]!.platform).toBe('wix')
    expect(events[0]!.resourceType).toBe('products')
    expect(events[0]!.action).toBe('created')
    expect(events[0]!.resourceId).toBe('prod-001')
  })

  it('parses product_updated event type', () => {
    const events = parseWixWebhookEvents(
      { data: { id: 'prod-002' } },
      'product_updated',
    )
    expect(events).toHaveLength(1)
    expect(events[0]!.resourceType).toBe('products')
    expect(events[0]!.action).toBe('updated')
  })

  it('parses order_created event type', () => {
    const events = parseWixWebhookEvents(
      { data: { id: 'order-001' } },
      'order_created',
    )
    expect(events).toHaveLength(1)
    expect(events[0]!.resourceType).toBe('orders')
    expect(events[0]!.action).toBe('created')
  })

  it('parses contact_updated event type', () => {
    const events = parseWixWebhookEvents(
      { data: { id: 'contact-001' } },
      'contact_updated',
    )
    expect(events).toHaveLength(1)
    expect(events[0]!.resourceType).toBe('customers')
    expect(events[0]!.action).toBe('updated')
  })

  it('parses slash-separated event types', () => {
    const events = parseWixWebhookEvents(
      { data: { id: 'col-001' } },
      'collection/created',
    )
    expect(events).toHaveLength(1)
    expect(events[0]!.resourceType).toBe('collections')
    expect(events[0]!.action).toBe('created')
  })

  it('falls back to entityId when data.id is missing', () => {
    const events = parseWixWebhookEvents(
      { entityId: 'ent-001' },
      'product_deleted',
    )
    expect(events[0]!.resourceId).toBe('ent-001')
  })

  it('returns unknown for unrecognised event types', () => {
    const events = parseWixWebhookEvents({}, 'something_weird')
    expect(events[0]!.resourceType).toBe('unknown')
  })

  it('extracts event type from body when header is absent', () => {
    const events = parseWixWebhookEvents({
      eventType: 'coupon_created',
      data: { id: 'c-001' },
    })
    expect(events[0]!.resourceType).toBe('discounts')
    expect(events[0]!.action).toBe('created')
  })
})
