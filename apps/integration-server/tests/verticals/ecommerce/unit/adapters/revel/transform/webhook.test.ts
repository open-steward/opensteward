import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import {
  verifyRevelWebhook,
  parseRevelWebhookEvents,
} from '../../../../../../../src/verticals/ecommerce/adapters/revel/webhook'

describe('verifyRevelWebhook', () => {
  const secret = 'test-secret-key'

  it('returns true for valid signature', () => {
    const body = Buffer.from('{"test": true}')
    const sig = createHmac('sha256', secret).update(body).digest('base64')
    const result = verifyRevelWebhook(body, { 'x-revel-signature': sig }, secret)
    expect(result).toBe(true)
  })

  it('returns false for invalid signature', () => {
    const body = Buffer.from('{"test": true}')
    const result = verifyRevelWebhook(body, { 'x-revel-signature': 'invalid' }, secret)
    expect(result).toBe(false)
  })

  it('returns false when header is missing', () => {
    const body = Buffer.from('{"test": true}')
    const result = verifyRevelWebhook(body, {}, secret)
    expect(result).toBe(false)
  })
})

describe('parseRevelWebhookEvents', () => {
  it('parses product created event', () => {
    const payload = {
      event_type: 'created',
      resource_type: 'Product',
      resource_id: '101',
      establishment_id: 'EST_001',
      data: { name: 'Espresso' },
    }
    const events = parseRevelWebhookEvents(payload)
    expect(events).toHaveLength(1)
    expect(events[0]!.platform).toBe('revel')
    expect(events[0]!.resourceType).toBe('products')
    expect(events[0]!.action).toBe('created')
    expect(events[0]!.resourceId).toBe('101')
    expect(events[0]!.tenantId).toBe('EST_001')
  })

  it('parses customer updated event', () => {
    const events = parseRevelWebhookEvents({
      event_type: 'updated',
      resource_type: 'Customer',
      resource_id: '200',
    })
    expect(events[0]!.resourceType).toBe('customers')
    expect(events[0]!.action).toBe('updated')
  })

  it('parses order deleted event', () => {
    const events = parseRevelWebhookEvents({
      event_type: 'deleted',
      resource_type: 'Order',
      resource_id: '300',
    })
    expect(events[0]!.resourceType).toBe('orders')
    expect(events[0]!.action).toBe('deleted')
  })

  it('returns empty array for missing resource_id', () => {
    const events = parseRevelWebhookEvents({ event_type: 'created', resource_type: 'Product' })
    expect(events).toEqual([])
  })

  it('maps unknown resource types to unknown', () => {
    const events = parseRevelWebhookEvents({
      event_type: 'created',
      resource_type: 'Widget',
      resource_id: '1',
    })
    expect(events[0]!.resourceType).toBe('unknown')
  })

  it('maps unknown event types to unknown action', () => {
    const events = parseRevelWebhookEvents({
      event_type: 'merged',
      resource_type: 'Customer',
      resource_id: '1',
    })
    expect(events[0]!.action).toBe('unknown')
  })
})
