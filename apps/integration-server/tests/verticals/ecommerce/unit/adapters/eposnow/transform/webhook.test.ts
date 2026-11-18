import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import {
  verifyEposNowWebhook,
  parseEposNowWebhookEvents,
} from '../../../../../../../src/verticals/ecommerce/adapters/eposnow/webhook'

describe('verifyEposNowWebhook', () => {
  const secret = 'test-secret-key'

  it('returns true for valid signature', () => {
    const body = Buffer.from('{"test": true}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    const result = verifyEposNowWebhook(body, { 'x-eposnow-signature': sig }, secret)
    expect(result).toBe(true)
  })

  it('returns false for invalid signature', () => {
    const body = Buffer.from('{"test": true}')
    const result = verifyEposNowWebhook(body, { 'x-eposnow-signature': 'invalid' }, secret)
    expect(result).toBe(false)
  })

  it('returns false when header is missing', () => {
    const body = Buffer.from('{"test": true}')
    const result = verifyEposNowWebhook(body, {}, secret)
    expect(result).toBe(false)
  })
})

describe('parseEposNowWebhookEvents', () => {
  it('parses product created event', () => {
    const payload = {
      EventType: 'Created',
      EntityType: 'Product',
      EntityId: 12345,
      LocationId: 1,
    }
    const events = parseEposNowWebhookEvents(payload)
    expect(events).toHaveLength(1)
    expect(events[0]!.platform).toBe('eposnow')
    expect(events[0]!.resourceType).toBe('products')
    expect(events[0]!.action).toBe('created')
    expect(events[0]!.resourceId).toBe('12345')
    expect(events[0]!.tenantId).toBe('1')
  })

  it('parses customer updated event', () => {
    const payload = {
      EventType: 'Updated',
      EntityType: 'Customer',
      EntityId: 5001,
    }
    const events = parseEposNowWebhookEvents(payload)
    expect(events).toHaveLength(1)
    expect(events[0]!.resourceType).toBe('customers')
    expect(events[0]!.action).toBe('updated')
  })

  it('parses category deleted event', () => {
    const payload = {
      EventType: 'Deleted',
      EntityType: 'Category',
      EntityId: 100,
    }
    const events = parseEposNowWebhookEvents(payload)
    expect(events[0]!.resourceType).toBe('collections')
    expect(events[0]!.action).toBe('deleted')
  })

  it('returns empty array for missing entity info', () => {
    const events = parseEposNowWebhookEvents({})
    expect(events).toEqual([])
  })

  it('maps unknown entity types to unknown', () => {
    const payload = {
      EventType: 'Created',
      EntityType: 'Widget',
      EntityId: 999,
    }
    const events = parseEposNowWebhookEvents(payload)
    expect(events[0]!.resourceType).toBe('unknown')
  })

  it('maps unknown event types to unknown action', () => {
    const payload = {
      EventType: 'Merged',
      EntityType: 'Product',
      EntityId: 123,
    }
    const events = parseEposNowWebhookEvents(payload)
    expect(events[0]!.action).toBe('unknown')
  })

  it('maps transaction events to orders', () => {
    const payload = {
      EventType: 'Created',
      EntityType: 'Transaction',
      EntityId: 80001,
    }
    const events = parseEposNowWebhookEvents(payload)
    expect(events[0]!.resourceType).toBe('orders')
  })
})
