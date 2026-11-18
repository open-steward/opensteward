import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyVendureWebhook, parseVendureWebhookEvents } from '../../../../../../../src/verticals/ecommerce/adapters/vendure/webhook'

describe('verifyVendureWebhook', () => {
  const secret = 'test-webhook-secret'

  it('returns true for valid HMAC-SHA256 hex signature', () => {
    const payload = Buffer.from('{"type":"ProductCreatedEvent","id":"1"}')
    const sig = createHmac('sha256', secret).update(payload).digest('hex')
    expect(
      verifyVendureWebhook(payload, { 'x-vendure-hmac-sha256': sig }, secret),
    ).toBe(true)
  })

  it('returns false for invalid signature', () => {
    const payload = Buffer.from('{"type":"ProductCreatedEvent","id":"1"}')
    expect(
      verifyVendureWebhook(payload, { 'x-vendure-hmac-sha256': 'invalid' }, secret),
    ).toBe(false)
  })

  it('returns false when header is missing', () => {
    const payload = Buffer.from('{"type":"ProductCreatedEvent","id":"1"}')
    expect(verifyVendureWebhook(payload, {}, secret)).toBe(false)
  })
})

describe('parseVendureWebhookEvents', () => {
  it('parses ProductCreatedEvent', () => {
    const events = parseVendureWebhookEvents(
      { id: '42', type: 'ProductCreatedEvent' },
      'ProductCreatedEvent',
    )
    expect(events).toHaveLength(1)
    expect(events[0]!.platform).toBe('vendure')
    expect(events[0]!.resourceType).toBe('products')
    expect(events[0]!.action).toBe('created')
    expect(events[0]!.resourceId).toBe('42')
  })

  it('parses OrderUpdatedEvent', () => {
    const events = parseVendureWebhookEvents(
      { id: '100', type: 'OrderUpdatedEvent' },
      'OrderUpdatedEvent',
    )
    expect(events[0]!.resourceType).toBe('orders')
    expect(events[0]!.action).toBe('updated')
  })

  it('parses CollectionDeletedEvent', () => {
    const events = parseVendureWebhookEvents(
      { id: '5', type: 'CollectionDeletedEvent' },
      'CollectionDeletedEvent',
    )
    expect(events[0]!.resourceType).toBe('collections')
    expect(events[0]!.action).toBe('deleted')
  })

  it('falls back to unknown for unrecognized events', () => {
    const events = parseVendureWebhookEvents(
      { id: '1' },
      'SomethingWeirdHappened',
    )
    expect(events[0]!.resourceType).toBe('unknown')
    expect(events[0]!.action).toBe('unknown')
  })

  it('extracts resource id from entity.id', () => {
    const events = parseVendureWebhookEvents(
      { entity: { id: '99' }, type: 'CustomerCreatedEvent' },
      'CustomerCreatedEvent',
    )
    expect(events[0]!.resourceId).toBe('99')
  })
})
