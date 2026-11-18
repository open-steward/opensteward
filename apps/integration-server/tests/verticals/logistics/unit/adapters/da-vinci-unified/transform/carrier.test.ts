import { describe, it, expect } from 'vitest'
import {
  transformCarrier,
  type DaVinciCarrier,
} from '../../../../../../../src/verticals/logistics/adapters/da-vinci-unified/transform/carrier'
import { CarrierSchema } from '../../../../../../../src/verticals/logistics/schema/carrier'

function makeCarrier(o: Partial<DaVinciCarrier> = {}): DaVinciCarrier {
  return {
    CarrierId: 42,
    CarrierCode: 'UPS',
    CarrierName: 'United Parcel Service',
    TrackingUrlTemplate: 'https://www.ups.com/track?tracknum={trackingNumber}',
    IsActive: true,
    Services: [
      {
        ServiceCode: 'UPS_GROUND',
        ServiceName: 'UPS Ground',
        TransitDaysMin: 1,
        TransitDaysMax: 5,
        IsGuaranteed: false,
      },
    ],
    CreatedDate: '2024-03-01T00:00:00Z',
    ModifiedDate: '2024-03-01T00:00:00Z',
    ...o,
  }
}

describe('da-vinci-unified transformCarrier', () => {
  it('maps CarrierId to string id', () => {
    const result = transformCarrier(makeCarrier())
    expect(result.id).toBe('42')
  })

  it('uses CarrierCode as id when CarrierId is null', () => {
    const result = transformCarrier(makeCarrier({ CarrierId: null }))
    expect(result.id).toBe('UPS')
  })

  it('maps CarrierName to name', () => {
    const result = transformCarrier(makeCarrier())
    expect(result.name).toBe('United Parcel Service')
  })

  it('maps CarrierCode to code', () => {
    const result = transformCarrier(makeCarrier())
    expect(result.code).toBe('UPS')
  })

  it('maps TrackingUrlTemplate', () => {
    const result = transformCarrier(makeCarrier())
    expect(result.trackingUrlTemplate).toBe('https://www.ups.com/track?tracknum={trackingNumber}')
  })

  it('maps IsActive', () => {
    const result = transformCarrier(makeCarrier())
    expect(result.isActive).toBe(true)
  })

  it('maps Services array', () => {
    const result = transformCarrier(makeCarrier())
    expect(result.services).toHaveLength(1)
    expect(result.services![0].code).toBe('UPS_GROUND')
    expect(result.services![0].name).toBe('UPS Ground')
  })

  it('maps service transit days', () => {
    const result = transformCarrier(makeCarrier())
    expect(result.services![0].transitDaysMin).toBe(1)
    expect(result.services![0].transitDaysMax).toBe(5)
  })

  it('sets services to undefined for empty array', () => {
    const result = transformCarrier(makeCarrier({ Services: [] }))
    expect(result.services).toBeUndefined()
  })

  it('maps CreatedDate to createdAt Date', () => {
    const result = transformCarrier(makeCarrier())
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('maps ModifiedDate to updatedAt Date', () => {
    const result = transformCarrier(makeCarrier())
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('passes CarrierSchema validation', () => {
    const result = transformCarrier(makeCarrier())
    expect(() => CarrierSchema.parse(result)).not.toThrow()
  })

  it('passes CarrierSchema validation with minimal input', () => {
    const result = transformCarrier({})
    expect(() => CarrierSchema.parse(result)).not.toThrow()
  })
})
