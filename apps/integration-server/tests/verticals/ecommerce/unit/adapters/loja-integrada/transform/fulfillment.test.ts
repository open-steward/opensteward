import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawShopifyFulfillment,
} from '../../../../../../../src/verticals/ecommerce/adapters/loja-integrada/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeRaw(overrides: Partial<RawShopifyFulfillment> = {}): RawShopifyFulfillment {
  return {
    id: 901,
    order_id: 5001,
    status: 'success',
    tracking_number: 'BR123456789BR',
    tracking_url: 'https://rastreamento.correios.com.br/BR123456789BR',
    tracking_company: 'Correios',
    service: 'PAC',
    location_id: 7001,
    line_items: [
      { id: 111, quantity: 2 },
      { id: 112, quantity: 1 },
    ],
    notify_customer: true,
    created_at: '2024-03-03T08:00:00Z',
    updated_at: '2024-03-04T10:00:00Z',
    ...overrides,
  }
}

describe('transformFulfillment (loja-integrada / Shopify)', () => {
  it('maps id and orderId', () => {
    const result = transformFulfillment(makeRaw())
    expect(result.id).toBe('901')
    expect(result.orderId).toBe('5001')
  })

  it('maps status to canonical enum', () => {
    expect(transformFulfillment(makeRaw({ status: 'success' })).status).toBe('SUCCESS')
    expect(transformFulfillment(makeRaw({ status: 'pending' })).status).toBe('PENDING')
    expect(transformFulfillment(makeRaw({ status: 'cancelled' })).status).toBe('CANCELLED')
    expect(transformFulfillment(makeRaw({ status: 'canceled' })).status).toBe('CANCELLED')
    expect(transformFulfillment(makeRaw({ status: 'error' })).status).toBe('ERROR')
    expect(transformFulfillment(makeRaw({ status: 'failure' })).status).toBe('FAILURE')
  })

  it('maps tracking fields and carrier', () => {
    const result = transformFulfillment(makeRaw())
    expect(result.trackingNumber).toBe('BR123456789BR')
    expect(result.trackingUrl).toBe('https://rastreamento.correios.com.br/BR123456789BR')
    expect(result.carrier).toBe('Correios')
    expect(result.service).toBe('PAC')
  })

  it('maps locationId', () => {
    const result = transformFulfillment(makeRaw())
    expect(result.locationId).toBe('7001')
  })

  it('maps line items', () => {
    const result = transformFulfillment(makeRaw())
    expect(result.lineItems).toHaveLength(2)
    expect(result.lineItems![0]!).toEqual({ lineItemId: '111', quantity: 2 })
    expect(result.lineItems![1]!).toEqual({ lineItemId: '112', quantity: 1 })
  })

  it('maps notifyCustomer and timestamps', () => {
    const result = transformFulfillment(makeRaw())
    expect(result.notifyCustomer).toBe(true)
    expect(result.createdAt).toBe('2024-03-03T08:00:00Z')
    expect(result.updatedAt).toBe('2024-03-04T10:00:00Z')
  })

  it('returns undefined lineItems when array is empty', () => {
    const result = transformFulfillment(makeRaw({ line_items: [] }))
    expect(result.lineItems).toBeUndefined()
  })

  it('returns undefined status for unknown status strings', () => {
    const result = transformFulfillment(makeRaw({ status: 'unknown_status' }))
    expect(result.status).toBeUndefined()
  })

  it('returns undefined locationId when location_id is null', () => {
    const result = transformFulfillment(makeRaw({ location_id: null }))
    expect(result.locationId).toBeUndefined()
  })

  it('preserves raw in metadata', () => {
    const raw = makeRaw()
    const result = transformFulfillment(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies FulfillmentSchema', () => {
    const result = transformFulfillment(makeRaw())
    expect(() => FulfillmentSchema.parse(result)).not.toThrow()
  })
})

describe('untransformFulfillment (loja-integrada / Shopify)', () => {
  it('maps canonical fields back to Shopify body keys', () => {
    const result = untransformFulfillment({
      locationId: '7001',
      trackingNumber: 'BR123456789BR',
      trackingUrl: 'https://rastreamento.correios.com.br/BR123456789BR',
      carrier: 'Correios',
      notifyCustomer: true,
      lineItems: [{ lineItemId: '111', quantity: 2 }],
    })
    expect(result.location_id).toBe('7001')
    expect(result.tracking_number).toBe('BR123456789BR')
    expect(result.tracking_url).toBe('https://rastreamento.correios.com.br/BR123456789BR')
    expect(result.tracking_company).toBe('Correios')
    expect(result.notify_customer).toBe(true)
    expect(result.line_items).toEqual([{ id: '111', quantity: 2 }])
  })
})
