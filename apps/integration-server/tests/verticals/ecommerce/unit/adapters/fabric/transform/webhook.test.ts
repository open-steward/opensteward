import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import {
  verifyFabricWebhook,
  parseFabricWebhookEvents,
} from '../../../../../../../src/verticals/ecommerce/adapters/fabric/webhook'

describe('verifyFabricWebhook', () => {
  const secret = 'test-webhook-secret'

  it('returns true for a valid HMAC-SHA256 signature', () => {
    const payload = Buffer.from('{"event":"order.created","data":{"id":"ord-001"}}')
    const sig = createHmac('sha256', secret).update(payload).digest('hex')
    const headers = { 'x-fabric-signature': sig }
    expect(verifyFabricWebhook(payload, headers, secret)).toBe(true)
  })

  it('returns false for an invalid signature', () => {
    const payload = Buffer.from('{"event":"order.created"}')
    const headers = { 'x-fabric-signature': 'invalid-sig' }
    expect(verifyFabricWebhook(payload, headers, secret)).toBe(false)
  })

  it('returns false when header is missing', () => {
    const payload = Buffer.from('{"event":"order.created"}')
    expect(verifyFabricWebhook(payload, {}, secret)).toBe(false)
  })

  it('handles case-insensitive header lookup', () => {
    const payload = Buffer.from('test-payload')
    const sig = createHmac('sha256', secret).update(payload).digest('hex')
    const headers = { 'X-Fabric-Signature': sig }
    expect(verifyFabricWebhook(payload, headers, secret)).toBe(true)
  })
})

describe('parseFabricWebhookEvents', () => {
  it('parses an order.created event', () => {
    const events = parseFabricWebhookEvents({
      event: 'order.created',
      data: { id: 'ord-001', status: 'pending' },
      merchant_id: 'merchant-001',
    })
    expect(events).toHaveLength(1)
    expect(events[0]!.platform).toBe('fabric')
    expect(events[0]!.resourceType).toBe('orders')
    expect(events[0]!.action).toBe('created')
    expect(events[0]!.resourceId).toBe('ord-001')
    expect(events[0]!.tenantId).toBe('merchant-001')
  })

  it('parses a product.updated event', () => {
    const events = parseFabricWebhookEvents({
      event: 'product.updated',
      data: { id: 'prod-001' },
    })
    expect(events[0]!.resourceType).toBe('products')
    expect(events[0]!.action).toBe('updated')
    expect(events[0]!.resourceId).toBe('prod-001')
  })

  it('parses a customer.deleted event', () => {
    const events = parseFabricWebhookEvents({
      event: 'customer.deleted',
      data: { id: 'cust-001' },
    })
    expect(events[0]!.resourceType).toBe('customers')
    expect(events[0]!.action).toBe('deleted')
  })

  it('maps inventory.adjusted to inventory_levels.updated', () => {
    const events = parseFabricWebhookEvents({
      event: 'inventory.adjusted',
      data: { id: 'inv-001' },
    })
    expect(events[0]!.resourceType).toBe('inventory_levels')
    expect(events[0]!.action).toBe('updated')
  })

  it('returns unknown for unrecognised events', () => {
    const events = parseFabricWebhookEvents({
      event: 'something.bizarre',
      data: { id: 'x' },
    })
    expect(events[0]!.resourceType).toBe('unknown')
    expect(events[0]!.action).toBe('unknown')
  })

  it('handles empty payload gracefully', () => {
    const events = parseFabricWebhookEvents({})
    expect(events).toHaveLength(1)
    expect(events[0]!.resourceType).toBe('unknown')
    expect(events[0]!.resourceId).toBe('')
  })

  it('uses type field as fallback when event is missing', () => {
    const events = parseFabricWebhookEvents({
      type: 'fulfillment.shipped',
      data: { id: 'ful-001' },
    })
    expect(events[0]!.resourceType).toBe('fulfillments')
    expect(events[0]!.action).toBe('updated')
  })
})
