import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import {
  verifySquarespaceWebhook,
  parseSquarespaceWebhookEvents,
} from '../../../../../../../src/verticals/ecommerce/adapters/squarespace/webhook'

describe('verifySquarespaceWebhook', () => {
  const secret = 'test-webhook-secret'

  it('accepts a valid signature', () => {
    const payload = Buffer.from('{"id":"order-123"}')
    const sig = createHmac('sha256', secret).update(payload).digest('hex')
    expect(
      verifySquarespaceWebhook(payload, { 'x-squarespace-signature': sig }, secret),
    ).toBe(true)
  })

  it('rejects an invalid signature', () => {
    const payload = Buffer.from('{"id":"order-123"}')
    expect(
      verifySquarespaceWebhook(
        payload,
        { 'x-squarespace-signature': 'bad-signature-value-here-0000000000000000' },
        secret,
      ),
    ).toBe(false)
  })

  it('rejects when header is missing', () => {
    const payload = Buffer.from('{"id":"order-123"}')
    expect(verifySquarespaceWebhook(payload, {}, secret)).toBe(false)
  })
})

describe('parseSquarespaceWebhookEvents', () => {
  it('maps order.create topic', () => {
    const events = parseSquarespaceWebhookEvents(
      { id: 'order-123', data: {} },
      'order.create',
    )
    expect(events).toHaveLength(1)
    expect(events[0]!.platform).toBe('squarespace')
    expect(events[0]!.resourceType).toBe('orders')
    expect(events[0]!.action).toBe('created')
    expect(events[0]!.resourceId).toBe('order-123')
  })

  it('maps product.update topic', () => {
    const events = parseSquarespaceWebhookEvents(
      { id: 'prod-456' },
      'product.update',
    )
    expect(events[0]!.resourceType).toBe('products')
    expect(events[0]!.action).toBe('updated')
  })

  it('maps inventory.update topic', () => {
    const events = parseSquarespaceWebhookEvents(
      { id: 'inv-789' },
      'inventory.update',
    )
    expect(events[0]!.resourceType).toBe('inventory_levels')
    expect(events[0]!.action).toBe('updated')
  })

  it('falls back to unknown for unrecognised topics', () => {
    const events = parseSquarespaceWebhookEvents(
      { id: 'x' },
      'something.weird',
    )
    expect(events[0]!.resourceType).toBe('unknown')
    expect(events[0]!.action).toBe('unknown')
  })

  it('extracts id from nested data if top-level id is absent', () => {
    const events = parseSquarespaceWebhookEvents(
      { data: { id: 'nested-123' } },
      'order.create',
    )
    expect(events[0]!.resourceId).toBe('nested-123')
  })
})
