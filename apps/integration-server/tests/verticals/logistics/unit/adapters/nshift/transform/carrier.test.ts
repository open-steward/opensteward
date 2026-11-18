import { describe, it, expect } from 'vitest'
import {
  transformCarrier,
  type NShiftPartner,
} from '../../../../../../../src/verticals/logistics/adapters/nshift/transform/carrier'
import { CarrierSchema } from '../../../../../../../src/verticals/logistics/schema/carrier'

// ─── Factory ─────────────────────────────────────────────────────────────────

function makePartner(overrides: Partial<NShiftPartner> = {}): NShiftPartner {
  return {
    id: 'dhl-de',
    name: 'DHL Germany',
    services: [
      { id: 'DHL_PARCEL', name: 'DHL Parcel' },
      { id: 'DHL_EXPRESS', name: 'DHL Express' },
    ],
    created: '2024-03-01T00:00:00Z',
    updated: '2024-06-15T12:00:00Z',
    ...overrides,
  }
}

// ─── transformCarrier ─────────────────────────────────────────────────────────

describe('transformCarrier', () => {
  it('maps id and name from raw partner', () => {
    const raw = makePartner()
    const result = transformCarrier(raw)

    expect(result.id).toBe('dhl-de')
    expect(result.name).toBe('DHL Germany')
  })

  it('sets code equal to id', () => {
    const raw = makePartner()
    const result = transformCarrier(raw)

    expect(result.code).toBe('dhl-de')
  })

  it('maps services array with code and name', () => {
    const raw = makePartner()
    const result = transformCarrier(raw)

    expect(result.services).toHaveLength(2)
    expect(result.services![0].code).toBe('DHL_PARCEL')
    expect(result.services![0].name).toBe('DHL Parcel')
    expect(result.services![1].code).toBe('DHL_EXPRESS')
  })

  it('sets isActive to true', () => {
    const raw = makePartner()
    expect(transformCarrier(raw).isActive).toBe(true)
  })

  it('parses created and updated as Date instances', () => {
    const raw = makePartner()
    const result = transformCarrier(raw)

    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('filters out services with null id', () => {
    const raw = makePartner({
      services: [
        { id: null, name: 'No-ID service' },
        { id: 'VALID', name: 'Valid service' },
      ],
    })
    const result = transformCarrier(raw)

    expect(result.services).toHaveLength(1)
    expect(result.services![0].code).toBe('VALID')
  })

  it('sets services to empty array when services is null', () => {
    const raw = makePartner({ services: null })
    const result = transformCarrier(raw)

    expect(result.services).toEqual([])
  })

  it('passes raw partner as metadata', () => {
    const raw = makePartner()
    expect(transformCarrier(raw).metadata).toBe(raw)
  })

  it('handles missing dates gracefully', () => {
    const raw = makePartner({ created: null, updated: null })
    const result = transformCarrier(raw)

    expect(result.createdAt).toBeUndefined()
    expect(result.updatedAt).toBeUndefined()
  })

  it('passes CarrierSchema.parse without throwing', () => {
    const raw = makePartner()
    const result = transformCarrier(raw)

    expect(() => CarrierSchema.parse(result)).not.toThrow()
  })
})
