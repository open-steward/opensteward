import { describe, it, expect } from 'vitest'
import {
  transformCarrier,
  type TrimbleTruckmateCarrierResponse,
} from '../../../../../../../src/verticals/logistics/adapters/trimble-truckmate/transform/carrier'
import { CarrierSchema } from '../../../../../../../src/verticals/logistics/schema/carrier'

function makeCarrier(
  overrides: Partial<TrimbleTruckmateCarrierResponse> = {},
): TrimbleTruckmateCarrierResponse {
  return {
    carrierId: 'CARRIER-001',
    carrierName: 'Trimble TruckMate Carrier',
    scac: 'TRMT',
    trackingUrlTemplate: 'https://tracking.example.com/{trackingNumber}',
    isActive: true,
    createdAt: '2024-03-01T00:00:00Z',
    updatedAt: '2024-03-01T00:00:00Z',
    services: [
      {
        serviceCode: 'FTL',
        serviceName: 'Full Truckload',
        transitDaysMin: 1,
        transitDaysMax: 3,
        isGuaranteed: false,
      },
    ],
    ...overrides,
  }
}

describe('trimble-truckmate transformCarrier', () => {
  it('maps id from carrierId', () => {
    const result = transformCarrier(makeCarrier())
    expect(result.id).toBe('CARRIER-001')
  })

  it('maps name from carrierName', () => {
    const result = transformCarrier(makeCarrier())
    expect(result.name).toBe('Trimble TruckMate Carrier')
  })

  it('maps code from scac', () => {
    const result = transformCarrier(makeCarrier())
    expect(result.code).toBe('TRMT')
  })

  it('maps trackingUrlTemplate', () => {
    const result = transformCarrier(makeCarrier())
    expect(result.trackingUrlTemplate).toBe('https://tracking.example.com/{trackingNumber}')
  })

  it('maps isActive', () => {
    const result = transformCarrier(makeCarrier())
    expect(result.isActive).toBe(true)
  })

  it('maps createdAt and updatedAt as Date', () => {
    const result = transformCarrier(makeCarrier())
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('maps services array', () => {
    const result = transformCarrier(makeCarrier())
    expect(result.services).toHaveLength(1)
    expect(result.services![0].code).toBe('FTL')
    expect(result.services![0].name).toBe('Full Truckload')
    expect(result.services![0].transitDaysMin).toBe(1)
    expect(result.services![0].transitDaysMax).toBe(3)
  })

  it('passes metadata through', () => {
    const raw = makeCarrier()
    expect(transformCarrier(raw).metadata).toBe(raw)
  })

  it('falls back id to raw.id when carrierId is absent', () => {
    const result = transformCarrier(makeCarrier({ carrierId: undefined, id: 'ID-002' }))
    expect(result.id).toBe('ID-002')
  })

  it('falls back code to carrierCode then code when scac is absent', () => {
    const result = transformCarrier(
      makeCarrier({ scac: undefined, carrierCode: 'CC1', code: 'C1' }),
    )
    expect(result.code).toBe('CC1')
  })

  it('emits undefined services when array is empty', () => {
    const result = transformCarrier(makeCarrier({ services: [] }))
    expect(result.services).toBeUndefined()
  })

  it('produces schema-valid output', () => {
    expect(() => CarrierSchema.parse(transformCarrier(makeCarrier()))).not.toThrow()
  })
})
