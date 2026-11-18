import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import {
  verifyWebflowWebhook,
  parseWebflowWebhookEvents,
} from '../../../../../../../src/verticals/ecommerce/adapters/webflow/webhook'

describe('verifyWebflowWebhook', () => {
  const secret = 'test-webhook-secret'

  it('returns true for a valid signature', () => {
    const body = Buffer.from('{"orderId":"ord_001"}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyWebflowWebhook(body, { 'x-webflow-signature': sig }, secret)).toBe(true)
  })

  it('returns false for an invalid signature', () => {
    const body = Buffer.from('{"orderId":"ord_001"}')
    expect(verifyWebflowWebhook(body, { 'x-webflow-signature': 'bad' }, secret)).toBe(false)
  })

  it('returns false when signature header is missing', () => {
    const body = Buffer.from('{}')
    expect(verifyWebflowWebhook(body, {}, secret)).toBe(false)
  })
})

describe('parseWebflowWebhookEvents', () => {
  it('parses ecomm_new_order', () => {
    const events = parseWebflowWebhookEvents(
      { orderId: 'ord_001', triggerType: 'ecomm_new_order' },
      'ecomm_new_order',
    )
    expect(events).toHaveLength(1)
    expect(events[0]!.resourceType).toBe('orders')
    expect(events[0]!.action).toBe('created')
    expect(events[0]!.resourceId).toBe('ord_001')
    expect(events[0]!.platform).toBe('webflow')
  })

  it('parses ecomm_order_changed', () => {
    const events = parseWebflowWebhookEvents({}, 'ecomm_order_changed')
    expect(events[0]!.resourceType).toBe('orders')
    expect(events[0]!.action).toBe('updated')
  })

  it('parses collection_item_created', () => {
    const events = parseWebflowWebhookEvents(
      { _id: 'item_001' },
      'collection_item_created',
    )
    expect(events[0]!.resourceType).toBe('collections')
    expect(events[0]!.action).toBe('created')
    expect(events[0]!.resourceId).toBe('item_001')
  })

  it('returns unknown for unrecognised trigger types', () => {
    const events = parseWebflowWebhookEvents({}, 'some_unknown_trigger')
    expect(events[0]!.resourceType).toBe('unknown')
    expect(events[0]!.action).toBe('unknown')
  })
})
