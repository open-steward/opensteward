import { describe, it, expect } from 'vitest'
import {
  verifyElasticPathWebhook,
  parseElasticPathWebhookEvents,
} from '../../../../../../../src/verticals/ecommerce/adapters/elasticpath/webhook'

describe('verifyElasticPathWebhook', () => {
  const secret = 'ep-webhook-secret-123'
  const payload = Buffer.from('{}')

  it('returns true when header matches secret', () => {
    const headers = { 'x-moltin-secret-key': secret }
    expect(verifyElasticPathWebhook(payload, headers, secret)).toBe(true)
  })

  it('returns false when header does not match', () => {
    const headers = { 'x-moltin-secret-key': 'wrong-secret' }
    expect(verifyElasticPathWebhook(payload, headers, secret)).toBe(false)
  })

  it('returns false when header is missing', () => {
    expect(verifyElasticPathWebhook(payload, {}, secret)).toBe(false)
  })

  it('accepts X-EP-Secret header variant', () => {
    const headers = { 'x-ep-secret': secret }
    expect(verifyElasticPathWebhook(payload, headers, secret)).toBe(true)
  })
})

describe('parseElasticPathWebhookEvents', () => {
  it('parses an order.paid event', () => {
    const payload = {
      type: 'order.paid',
      resources: { id: 'ord-001' },
      store_id: 'store-abc',
    }
    const events = parseElasticPathWebhookEvents(payload)
    expect(events).toHaveLength(1)
    const ev = events[0]!
    expect(ev.platform).toBe('elasticpath')
    expect(ev.resourceType).toBe('orders')
    expect(ev.action).toBe('updated')
    expect(ev.resourceId).toBe('ord-001')
    expect(ev.tenantId).toBe('store-abc')
  })

  it('parses a customer.created event', () => {
    const payload = {
      type: 'customer.created',
      resources: { id: 'cust-001' },
    }
    const events = parseElasticPathWebhookEvents(payload)
    expect(events[0]!.resourceType).toBe('customers')
    expect(events[0]!.action).toBe('created')
    expect(events[0]!.resourceId).toBe('cust-001')
  })

  it('parses a product.updated event', () => {
    const payload = {
      type: 'product.updated',
      resources: { id: 'prod-001' },
    }
    const events = parseElasticPathWebhookEvents(payload)
    expect(events[0]!.resourceType).toBe('products')
    expect(events[0]!.action).toBe('updated')
  })

  it('parses a product.deleted event', () => {
    const payload = {
      type: 'product.deleted',
      resources: { id: 'prod-002' },
    }
    const events = parseElasticPathWebhookEvents(payload)
    expect(events[0]!.resourceType).toBe('products')
    expect(events[0]!.action).toBe('deleted')
  })

  it('falls back to unknown for unrecognized events', () => {
    const payload = {
      type: 'custom.event',
      id: 'res-001',
    }
    const events = parseElasticPathWebhookEvents(payload)
    expect(events[0]!.resourceType).toBe('unknown')
    expect(events[0]!.action).toBe('unknown')
    expect(events[0]!.resourceId).toBe('res-001')
  })

  it('extracts resourceId from payload.id when resources missing', () => {
    const payload = {
      type: 'order.created',
      id: 'ord-from-id',
    }
    const events = parseElasticPathWebhookEvents(payload)
    expect(events[0]!.resourceId).toBe('ord-from-id')
  })

  it('handles empty payload gracefully', () => {
    const events = parseElasticPathWebhookEvents({})
    expect(events).toHaveLength(1)
    expect(events[0]!.resourceType).toBe('unknown')
    expect(events[0]!.action).toBe('unknown')
    expect(events[0]!.resourceId).toBe('')
  })
})
