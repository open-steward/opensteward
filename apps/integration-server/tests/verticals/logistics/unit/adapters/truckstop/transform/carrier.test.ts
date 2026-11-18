import { describe, it, expect } from 'vitest'
import {
  transformCarrier,
  type TruckstopCarrierProfile,
} from '../../../../../../../src/verticals/logistics/adapters/truckstop/transform/carrier'
import { CarrierSchema } from '../../../../../../../src/verticals/logistics/schema/carrier'

function makeCarrier(overrides: Partial<TruckstopCarrierProfile> = {}): TruckstopCarrierProfile {
  return {
    carrierProfileId: 'CP-001',
    name: 'Truckstop Carrier',
    dotNumber: 'DOT-123456',
    isActive: true,
    createdDate: '2024-03-01T00:00:00Z',
    lastUpdatedDate: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('truckstop transformCarrier', () => {
  it('maps id from carrierProfileId', () => {
    expect(transformCarrier(makeCarrier()).id).toBe('CP-001')
  })

  it('maps name', () => {
    expect(transformCarrier(makeCarrier()).name).toBe('Truckstop Carrier')
  })

  it('maps code from dotNumber', () => {
    expect(transformCarrier(makeCarrier()).code).toBe('DOT-123456')
  })

  it('falls back code to mcNumber when dotNumber absent', () => {
    expect(transformCarrier(makeCarrier({ dotNumber: undefined, mcNumber: 'MC-9999' })).code).toBe(
      'MC-9999',
    )
  })

  it('maps isActive', () => {
    expect(transformCarrier(makeCarrier()).isActive).toBe(true)
  })

  it('maps createdAt from createdDate as Date', () => {
    expect(transformCarrier(makeCarrier()).createdAt).toBeInstanceOf(Date)
  })

  it('maps updatedAt from lastUpdatedDate as Date', () => {
    expect(transformCarrier(makeCarrier()).updatedAt).toBeInstanceOf(Date)
  })

  it('falls back id to carrierId', () => {
    expect(
      transformCarrier(makeCarrier({ carrierProfileId: undefined, carrierId: 'C-002' })).id,
    ).toBe('C-002')
  })

  it('passes metadata through', () => {
    const raw = makeCarrier()
    expect(transformCarrier(raw).metadata).toBe(raw)
  })

  it('produces schema-valid output', () => {
    expect(() => CarrierSchema.parse(transformCarrier(makeCarrier()))).not.toThrow()
  })
})
