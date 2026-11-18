import { describe, it, expect } from 'vitest'
import {
  transformEvaluatedServiceMethod,
  type ShipiumEvaluatedServiceMethod,
} from '../../../../../../../src/verticals/logistics/adapters/shipium/transform/rate'
import { RateSchema } from '../../../../../../../src/verticals/logistics/schema/rate'

function makeRaw(
  overrides: Partial<ShipiumEvaluatedServiceMethod> = {},
): ShipiumEvaluatedServiceMethod {
  return {
    carrierSelectionId: 'cs-001',
    carrier: 'fedex',
    serviceMethodName: 'FedEx Ground',
    serviceMethodCode: 'FEDEX_GROUND',
    totalCost: 12.5,
    currencyCode: 'USD',
    transitDays: 3,
    estimatedDeliveryDate: '2024-03-04T00:00:00Z',
    ...overrides,
  }
}

describe('transformEvaluatedServiceMethod', () => {
  it('maps id from carrierSelectionId', () => {
    expect(transformEvaluatedServiceMethod(makeRaw()).id).toBe('cs-001')
  })

  it('maps carrierId from carrier field', () => {
    expect(transformEvaluatedServiceMethod(makeRaw()).carrierId).toBe('fedex')
  })

  it('maps serviceCode from serviceMethodCode', () => {
    expect(transformEvaluatedServiceMethod(makeRaw()).serviceCode).toBe('FEDEX_GROUND')
  })

  it('converts totalCost decimal dollars to integer minor units (cents)', () => {
    // 12.50 USD = 1250 cents
    expect(transformEvaluatedServiceMethod(makeRaw()).totalAmount).toBe(1250)
  })

  it('maps transitDays', () => {
    expect(transformEvaluatedServiceMethod(makeRaw()).transitDays).toBe(3)
  })

  it('maps deliveryDays equal to transitDays', () => {
    expect(transformEvaluatedServiceMethod(makeRaw()).deliveryDays).toBe(3)
  })

  it('maps estimatedDeliveryAt as Date', () => {
    const result = transformEvaluatedServiceMethod(makeRaw())
    expect(result.estimatedDeliveryAt).toEqual(new Date('2024-03-04T00:00:00Z'))
  })

  it('defaults currency to USD when not provided', () => {
    const result = transformEvaluatedServiceMethod(makeRaw({ currencyCode: null }))
    expect(result.currency).toBe('USD')
  })

  it('uppercases currency code', () => {
    const result = transformEvaluatedServiceMethod(makeRaw({ currencyCode: 'cad' }))
    expect(result.currency).toBe('CAD')
  })

  it('emits undefined totalAmount when totalCost is null', () => {
    const result = transformEvaluatedServiceMethod(makeRaw({ totalCost: null }))
    expect(result.totalAmount).toBeUndefined()
  })

  it('falls back to serviceMethodName for serviceCode when serviceMethodCode absent', () => {
    const result = transformEvaluatedServiceMethod(makeRaw({ serviceMethodCode: null }))
    expect(result.serviceCode).toBe('FedEx Ground')
  })

  it('passes schema validation', () => {
    const result = transformEvaluatedServiceMethod(makeRaw())
    expect(() => RateSchema.parse(result)).not.toThrow()
  })

  it('passes metadata through unmodified', () => {
    const raw = makeRaw()
    expect(transformEvaluatedServiceMethod(raw).metadata).toBe(raw)
  })
})
