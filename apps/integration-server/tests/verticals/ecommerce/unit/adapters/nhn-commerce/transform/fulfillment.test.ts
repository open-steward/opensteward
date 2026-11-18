import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  type RawNhnOrderOptionWithDelivery,
} from '../../../../../../../src/verticals/ecommerce/adapters/nhn-commerce/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeRaw(
  overrides: Partial<RawNhnOrderOptionWithDelivery> = {},
): RawNhnOrderOptionWithDelivery {
  return {
    orderNo: 'ORD20240301001',
    orderOptionNo: 10001,
    productNo: 555,
    orderStatusType: 'DELIVERY_ING',
    delivery: {
      invoiceNo: 'INV123456',
      deliveryCompanyType: 'CJ_GLS',
      deliveryType: 'PARCEL',
      deliveryStateType: 'IN_TRANSIT',
    },
    ...overrides,
  }
}

describe('transformFulfillment (NHN Commerce)', () => {
  it('maps orderOptionNo to canonical id', () => {
    const result = transformFulfillment(makeRaw())
    expect(result.id).toBe('10001')
  })

  it('uses provided orderId over orderNo', () => {
    const result = transformFulfillment(makeRaw(), 'OVERRIDE-ORDER')
    expect(result.orderId).toBe('OVERRIDE-ORDER')
  })

  it('falls back to orderNo when no orderId provided', () => {
    const result = transformFulfillment(makeRaw())
    expect(result.orderId).toBe('ORD20240301001')
  })

  it('maps DELIVERY_ING to OPEN status', () => {
    const result = transformFulfillment(makeRaw())
    expect(result.status).toBe('OPEN')
  })

  it('maps DELIVERY_PREPARE to PENDING status', () => {
    const result = transformFulfillment(makeRaw({ orderStatusType: 'DELIVERY_PREPARE' }))
    expect(result.status).toBe('PENDING')
  })

  it('maps DELIVERY_DONE to SUCCESS status', () => {
    const result = transformFulfillment(makeRaw({ orderStatusType: 'DELIVERY_DONE' }))
    expect(result.status).toBe('SUCCESS')
  })

  it('maps CANCEL_DONE to CANCELLED status', () => {
    const result = transformFulfillment(makeRaw({ orderStatusType: 'CANCEL_DONE' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps tracking number from delivery.invoiceNo', () => {
    const result = transformFulfillment(makeRaw())
    expect(result.trackingNumber).toBe('INV123456')
  })

  it('maps carrier from delivery.deliveryCompanyType', () => {
    const result = transformFulfillment(makeRaw())
    expect(result.carrier).toBe('CJ_GLS')
  })

  it('synthesises lineItem from orderOptionNo', () => {
    const result = transformFulfillment(makeRaw())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0]!.lineItemId).toBe('10001')
    expect(result.lineItems![0]!.quantity).toBe(1)
  })

  it('produces a payload that satisfies FulfillmentSchema', () => {
    const result = transformFulfillment(makeRaw())
    expect(() => FulfillmentSchema.parse(result)).not.toThrow()
  })
})
