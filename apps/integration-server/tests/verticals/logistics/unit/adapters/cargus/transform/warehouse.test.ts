import { describe, it, expect } from 'vitest'
import {
  transformWarehouse,
  type CargusPickupLocation,
} from '../../../../../../../src/verticals/logistics/adapters/cargus/transform/warehouse'
import { WarehouseSchema } from '../../../../../../../src/verticals/logistics/schema/warehouse'

function makeRaw(overrides: Partial<CargusPickupLocation> = {}): CargusPickupLocation {
  return {
    LocationId: 7,
    Name: 'Depot Bucharest',
    CountyName: 'Ilfov',
    LocalityName: 'Bucharest',
    StreetName: 'Strada Victoriei',
    BuildingNumber: '1',
    CodPostal: '010001',
    ContactPerson: 'Ion Popescu',
    PhoneNumber: '+40721000001',
    Email: 'depot@cargus.ro',
    AutomaticEOD: '18:00:00',
    ...overrides,
  }
}

describe('cargus transformWarehouse', () => {
  it('maps LocationId to id as string', () => {
    expect(transformWarehouse(makeRaw({ LocationId: 7 })).id).toBe('7')
  })

  it('maps Name to name', () => {
    expect(transformWarehouse(makeRaw()).name).toBe('Depot Bucharest')
  })

  it('maps street from StreetName + BuildingNumber', () => {
    expect(transformWarehouse(makeRaw()).address?.street1).toBe('Strada Victoriei 1')
  })

  it('maps LocalityName to city', () => {
    expect(transformWarehouse(makeRaw()).address?.city).toBe('Bucharest')
  })

  it('maps CountyName to state', () => {
    expect(transformWarehouse(makeRaw()).address?.state).toBe('Ilfov')
  })

  it('maps CodPostal to postalCode', () => {
    expect(transformWarehouse(makeRaw()).address?.postalCode).toBe('010001')
  })

  it('hardcodes country to RO', () => {
    expect(transformWarehouse(makeRaw()).address?.country).toBe('RO')
  })

  it('maps AutomaticEOD HH:MM:SS → cutoffTime HH:MM', () => {
    expect(transformWarehouse(makeRaw({ AutomaticEOD: '18:00:00' })).cutoffTime).toBe('18:00')
  })

  it('hardcodes isActive to true', () => {
    expect(transformWarehouse(makeRaw()).isActive).toBe(true)
  })

  it('preserves metadata', () => {
    const raw = makeRaw()
    expect(transformWarehouse(raw).metadata).toBe(raw)
  })

  it('produces output that satisfies WarehouseSchema', () => {
    const result = transformWarehouse(makeRaw())
    expect(() => WarehouseSchema.parse(result)).not.toThrow()
  })

  it('falls back to AddressText when StreetName is absent', () => {
    const result = transformWarehouse(
      makeRaw({ StreetName: null, BuildingNumber: null, AddressText: '123 Main St' }),
    )
    expect(result.address?.street1).toBe('123 Main St')
  })

  it('returns undefined address when all address fields absent', () => {
    const result = transformWarehouse(
      makeRaw({
        StreetName: null,
        BuildingNumber: null,
        AddressText: null,
        LocalityName: null,
        CountyName: null,
        CodPostal: null,
      }),
    )
    expect(result.address).toBeUndefined()
  })
})
