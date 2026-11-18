import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import {
  verifyToastWebhook,
  parseToastWebhookEvents,
} from '../../../../../../../src/verticals/ecommerce/adapters/toast/webhook'

describe('verifyToastWebhook', () => {
  const secret = 'test-secret-key'
  const body = Buffer.from('{"eventType":"order.created"}')

  it('returns true for a valid signature', () => {
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    const result = verifyToastWebhook(body, { 'x-toast-signature': sig }, secret)
    expect(result).toBe(true)
  })

  it('returns false for an invalid signature', () => {
    const result = verifyToastWebhook(body, { 'x-toast-signature': 'bad' }, secret)
    expect(result).toBe(false)
  })

  it('returns false when signature header is missing', () => {
    const result = verifyToastWebhook(body, {}, secret)
    expect(result).toBe(false)
  })
})

describe('parseToastWebhookEvents', () => {
  it('parses an order.created event', () => {
    const events = parseToastWebhookEvents({
      eventType: 'order.created',
      resourceId: 'ORD_001',
      restaurantGuid: 'REST_001',
      webhookId: 'WH_001',
    })
    expect(events).toHaveLength(1)
    expect(events[0]!.platform).toBe('toast')
    expect(events[0]!.resourceType).toBe('orders')
    expect(events[0]!.action).toBe('created')
    expect(events[0]!.resourceId).toBe('ORD_001')
    expect(events[0]!.tenantId).toBe('REST_001')
    expect(events[0]!.id).toBe('WH_001')
  })

  it('parses a menu.updated event', () => {
    const events = parseToastWebhookEvents({
      eventType: 'menu.updated',
      resourceId: 'MI_001',
    })
    expect(events[0]!.resourceType).toBe('products')
    expect(events[0]!.action).toBe('updated')
  })

  it('parses a payment.completed event', () => {
    const events = parseToastWebhookEvents({
      eventType: 'payment.completed',
      resourceId: 'PAY_001',
    })
    expect(events[0]!.resourceType).toBe('transactions')
    expect(events[0]!.action).toBe('updated')
  })

  it('handles unknown event types gracefully', () => {
    const events = parseToastWebhookEvents({
      eventType: 'unknown.something',
      resourceId: 'X_001',
    })
    expect(events[0]!.resourceType).toBe('unknown')
    expect(events[0]!.action).toBe('unknown')
  })
})
