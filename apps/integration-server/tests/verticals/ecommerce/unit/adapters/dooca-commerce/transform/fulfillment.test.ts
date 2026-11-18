import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawDoocaFulfillment,
} from '../../../../../../../src/verticals/ecommerce/adapters/dooca-commerce/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeFulfillment(overrides: Partial<RawDoocaFulfillment> = {}): RawDoocaFulfillment {
  return {
    id: 55,
    order_id: 200,
    status: 'shipped',
    shipping_code: 'BR123456789',
    shipping_track_url: 'https://tracking.correios.com.br/BR123456789',
    shipping_carrier: 'Correios',
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformFulfillment (Dooca Commerce)', () => {
  it('maps id as string from numeric id', () => {
    const result = transformFulfillment(makeFulfillment({ id: 55 }))
    expect(result.id).toBe('55')
  })

  it('uses order_id as id when id is null', () => {
    const result = transformFulfillment(makeFulfillment({ id: null }))
    expect(result.id).toBe('200')
  })

  it('maps order_id as string', () => {
    const result = transformFulfillment(makeFulfillment())
    expect(result.orderId).toBe('200')
  })

  it('maps status "shipped" to SUCCESS', () => {
    const result = transformFulfillment(makeFulfillment({ status: 'shipped' }))
    expect(result.status).toBe('SUCCESS')
  })

  it('maps status "delivered" to SUCCESS', () => {
    const result = transformFulfillment(makeFulfillment({ status: 'delivered' }))
    expect(result.status).toBe('SUCCESS')
  })

  it('maps status "attended" to OPEN', () => {
    const result = transformFulfillment(makeFulfillment({ status: 'attended' }))
    expect(result.status).toBe('OPEN')
  })

  it('maps status "invoiced" to OPEN', () => {
    const result = transformFulfillment(makeFulfillment({ status: 'invoiced' }))
    expect(result.status).toBe('OPEN')
  })

  it('maps trackingNumber', () => {
    const result = transformFulfillment(makeFulfillment())
    expect(result.trackingNumber).toBe('BR123456789')
  })

  it('maps trackingUrl', () => {
    const result = transformFulfillment(makeFulfillment())
    expect(result.trackingUrl).toBe('https://tracking.correios.com.br/BR123456789')
  })

  it('maps carrier', () => {
    const result = transformFulfillment(makeFulfillment())
    expect(result.carrier).toBe('Correios')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeFulfillment()
    const result = transformFulfillment(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying FulfillmentSchema', () => {
    const result = transformFulfillment(makeFulfillment())
    expect(() => FulfillmentSchema.parse(result)).not.toThrow()
  })
})

describe('untransformFulfillment (Dooca Commerce)', () => {
  it('maps carrier to shipping_carrier', () => {
    const body = untransformFulfillment({ carrier: 'Correios' })
    expect(body['shipping_carrier']).toBe('Correios')
  })

  it('maps trackingNumber to shipping_code', () => {
    const body = untransformFulfillment({ trackingNumber: 'BR123' })
    expect(body['shipping_code']).toBe('BR123')
  })

  it('maps trackingUrl to shipping_track_url', () => {
    const body = untransformFulfillment({ trackingUrl: 'https://tracking.example.com/1' })
    expect(body['shipping_track_url']).toBe('https://tracking.example.com/1')
  })
})
