import { describe, it, expect } from 'vitest'
import {
  transformEstimation,
  type SamedayEstimationResponse,
} from '../../../../../../../src/verticals/logistics/adapters/sameday/transform/rate'
import { RateSchema } from '../../../../../../../src/verticals/logistics/schema/rate'

function makeEstimation(
  overrides: Partial<SamedayEstimationResponse> = {},
): SamedayEstimationResponse {
  return {
    amount: 34.5,
    currency: 'RON',
    time: 2,
    ...overrides,
  }
}

describe('sameday transformEstimation', () => {
  it('sets carrierId to sameday', () => {
    expect(transformEstimation(makeEstimation()).carrierId).toBe('sameday')
  })

  it('maps totalAmount from amount converted to integer minor units', () => {
    // 34.5 RON → Math.round(34.5 * 100) = 3450 bani
    expect(transformEstimation(makeEstimation()).totalAmount).toBe(3450)
  })

  it('maps currency', () => {
    expect(transformEstimation(makeEstimation()).currency).toBe('RON')
  })

  it('maps transitDays and deliveryDays from time', () => {
    const r = transformEstimation(makeEstimation())
    expect(r.transitDays).toBe(2)
    expect(r.deliveryDays).toBe(2)
  })

  it('maps serviceCode from serviceId when provided', () => {
    const r = transformEstimation(makeEstimation(), 5)
    expect(r.serviceCode).toBe('5')
  })

  it('leaves serviceCode undefined when no serviceId', () => {
    expect(transformEstimation(makeEstimation()).serviceCode).toBeUndefined()
  })

  it('defaults currency to RON when absent', () => {
    // currency field can be undefined in edge cases (cast to string | undefined)
    const raw = makeEstimation()
    ;(raw as Record<string, unknown>).currency = undefined
    expect(transformEstimation(raw).currency).toBe('RON')
  })

  it('preserves raw metadata', () => {
    const raw = makeEstimation()
    expect(transformEstimation(raw).metadata).toBe(raw)
  })

  it('passes RateSchema validation — totalAmount is converted to integer minor-units', () => {
    // 34.5 RON → Math.round(34.5 * 100) = 3450 bani (integer), satisfies z.number().int()
    const result = transformEstimation(makeEstimation(), 1)
    expect(() => RateSchema.parse(result)).not.toThrow()
  })
})
