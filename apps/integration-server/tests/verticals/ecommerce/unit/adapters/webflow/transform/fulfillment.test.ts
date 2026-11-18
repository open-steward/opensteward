import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawWebflowFulfillment,
} from '../../../../../../../src/verticals/ecommerce/adapters/webflow/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeFulfillment(overrides: Partial<RawWebflowFulfillment> = {}): RawWebflowFulfillment {
  return {
    id: 'ful_001',
    orderId: 'ord_001',
    status: 'fulfilled',
    trackingNumber: 'TRK123456',
    trackingUrl: 'https://track.example.com/TRK123456',
    carrier: 'FedEx',
    fulfilledOn: '2024-05-02T14:00:00Z',
    createdOn: '2024-05-01T10:00:00Z',
    ...overrides,
  }
}

describe('transformFulfillment', () => {
  it('maps core fields', () => {
    const result = transformFulfillment(makeFulfillment())
    expect(result.id).toBe('ful_001')
    expect(result.orderId).toBe('ord_001')
    expect(result.status).toBe('SUCCESS')
    expect(result.trackingNumber).toBe('TRK123456')
    expect(result.carrier).toBe('FedEx')
    expect(result.shippedAt).toBe('2024-05-02T14:00:00Z')
  })

  it('maps pending status', () => {
    const result = transformFulfillment(makeFulfillment({ status: 'pending' }))
    expect(result.status).toBe('PENDING')
  })

  it('maps cancelled status', () => {
    const result = transformFulfillment(makeFulfillment({ status: 'cancelled' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeFulfillment()
    const result = transformFulfillment(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies FulfillmentSchema', () => {
    const result = transformFulfillment(makeFulfillment())
    expect(() => FulfillmentSchema.parse(result)).not.toThrow()
  })

  it('maps notifyCustomer via untransformFulfillment', () => {
    const raw = untransformFulfillment({ notifyCustomer: true })
    expect(raw.sendOrderFulfilledEmail).toBe(true)
  })
})
