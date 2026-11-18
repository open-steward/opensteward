import { describe, it, expect } from 'vitest'
import {
  transformRateEstimate,
  transformRateResponse,
  type TruckstopRateEstimate,
  type TruckstopRateEstimateResponse,
} from '../../../../../../../src/verticals/logistics/adapters/truckstop/transform/rate'
import { RateSchema } from '../../../../../../../src/verticals/logistics/schema/rate'

function makeEstimate(overrides: Partial<TruckstopRateEstimate> = {}): TruckstopRateEstimate {
  return {
    rateEstimateId: 'RE-001',
    serviceType: 'FTL',
    serviceName: 'Full Truckload',
    totalRate: 1800,
    currency: 'USD',
    estimatedTransitDays: 2,
    estimatedDeliveryDate: '2024-03-04T00:00:00Z',
    ...overrides,
  }
}

describe('truckstop transformRateEstimate', () => {
  it('maps id from rateEstimateId', () => {
    expect(transformRateEstimate(makeEstimate()).id).toBe('RE-001')
  })

  it('maps carrierId to truckstop', () => {
    expect(transformRateEstimate(makeEstimate()).carrierId).toBe('truckstop')
  })

  it('maps serviceCode from serviceType', () => {
    expect(transformRateEstimate(makeEstimate()).serviceCode).toBe('FTL')
  })

  it('maps serviceName', () => {
    expect(transformRateEstimate(makeEstimate()).serviceName).toBe('Full Truckload')
  })

  it('maps currency', () => {
    expect(transformRateEstimate(makeEstimate()).currency).toBe('USD')
  })

  it('converts totalRate dollars to minor units (cents)', () => {
    // 1800 dollars → 180000 cents
    expect(transformRateEstimate(makeEstimate()).totalAmount).toBe(180000)
  })

  it('maps transitDays', () => {
    expect(transformRateEstimate(makeEstimate()).transitDays).toBe(2)
  })

  it('maps estimatedDeliveryAt as Date', () => {
    expect(transformRateEstimate(makeEstimate()).estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('defaults currency to USD when absent', () => {
    expect(transformRateEstimate(makeEstimate({ currency: undefined })).currency).toBe('USD')
  })

  it('rounds transit days to integer', () => {
    expect(transformRateEstimate(makeEstimate({ estimatedTransitDays: 2.7 })).transitDays).toBe(3)
  })

  it('passes metadata through', () => {
    const raw = makeEstimate()
    expect(transformRateEstimate(raw).metadata).toBe(raw)
  })

  it('produces schema-valid output', () => {
    expect(() => RateSchema.parse(transformRateEstimate(makeEstimate()))).not.toThrow()
  })
})

describe('truckstop transformRateResponse', () => {
  it('produces one Rate per estimate in rateEstimates', () => {
    const raw: TruckstopRateEstimateResponse = {
      rateEstimates: [makeEstimate(), makeEstimate({ rateEstimateId: 'RE-002' })],
    }
    expect(transformRateResponse(raw)).toHaveLength(2)
  })

  it('wraps single rateEstimate into array', () => {
    const raw: TruckstopRateEstimateResponse = { rateEstimate: makeEstimate() }
    expect(transformRateResponse(raw)).toHaveLength(1)
  })

  it('returns empty when neither field present', () => {
    expect(transformRateResponse({})).toHaveLength(0)
  })
})
