import { describe, it, expect } from 'vitest'
import {
  transformWarehouse,
  extractLocations,
  type PiyoviLocation,
  type PiyoviLocationsResponse,
} from '../../../../../../../src/verticals/logistics/adapters/central-transport/transform/warehouse'
import { WarehouseSchema } from '../../../../../../../src/verticals/logistics/schema/warehouse'

function makeRaw(overrides: Partial<PiyoviLocation> = {}): PiyoviLocation {
  return {
    id: 'LOC-001',
    referenceId: 'REF-LOC-001',
    groupId: 'GRP-1',
    locationName: 'Detroit Hub',
    active: true,
    address: {
      contactName: 'Jane Doe',
      emailAddress: 'jane@hub.example.com',
      phoneNumber1: '+13135550101',
      address1: '100 Industrial Dr',
      address2: 'Suite 200',
      city: 'Detroit',
      stateProvince: 'MI',
      country: 'US',
      zipPostalCode: '48201',
    },
    createdAt: '2024-03-01T00:00:00Z',
    updatedAt: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('central-transport transformWarehouse', () => {
  it('maps id to id', () => {
    expect(transformWarehouse(makeRaw()).id).toBe('LOC-001')
  })

  it('falls back to referenceId when id absent', () => {
    expect(transformWarehouse(makeRaw({ id: undefined })).id).toBe('REF-LOC-001')
  })

  it('maps locationName to name', () => {
    expect(transformWarehouse(makeRaw()).name).toBe('Detroit Hub')
  })

  it('maps referenceId to code', () => {
    expect(transformWarehouse(makeRaw()).code).toBe('REF-LOC-001')
  })

  it('maps address.address1 to address.street1', () => {
    expect(transformWarehouse(makeRaw()).address?.street1).toBe('100 Industrial Dr')
  })

  it('maps address.address2 to address.street2', () => {
    expect(transformWarehouse(makeRaw()).address?.street2).toBe('Suite 200')
  })

  it('maps address.city to address.city', () => {
    expect(transformWarehouse(makeRaw()).address?.city).toBe('Detroit')
  })

  it('maps address.stateProvince to address.state', () => {
    expect(transformWarehouse(makeRaw()).address?.state).toBe('MI')
  })

  it('maps address.zipPostalCode to address.postalCode', () => {
    expect(transformWarehouse(makeRaw()).address?.postalCode).toBe('48201')
  })

  it('maps address.country to address.country', () => {
    expect(transformWarehouse(makeRaw()).address?.country).toBe('US')
  })

  it('maps active to isActive', () => {
    expect(transformWarehouse(makeRaw({ active: true })).isActive).toBe(true)
    expect(transformWarehouse(makeRaw({ active: false })).isActive).toBe(false)
  })

  it('maps createdAt to createdAt as Date', () => {
    expect(transformWarehouse(makeRaw()).createdAt).toBeInstanceOf(Date)
  })

  it('preserves metadata', () => {
    const raw = makeRaw()
    expect(transformWarehouse(raw).metadata).toBe(raw)
  })

  it('produces output that satisfies WarehouseSchema', () => {
    const result = transformWarehouse(makeRaw())
    expect(() => WarehouseSchema.parse(result)).not.toThrow()
  })

  it('returns undefined address when address is absent', () => {
    expect(transformWarehouse(makeRaw({ address: undefined })).address).toBeUndefined()
  })
})

describe('central-transport extractLocations', () => {
  it('extracts from data field', () => {
    const raw: PiyoviLocationsResponse = { data: [makeRaw()] }
    expect(extractLocations(raw)).toHaveLength(1)
  })

  it('falls back to items field', () => {
    const raw: PiyoviLocationsResponse = { items: [makeRaw()] }
    expect(extractLocations(raw)).toHaveLength(1)
  })

  it('falls back to locations field', () => {
    const raw: PiyoviLocationsResponse = { locations: [makeRaw()] }
    expect(extractLocations(raw)).toHaveLength(1)
  })

  it('returns empty array when none present', () => {
    expect(extractLocations({})).toHaveLength(0)
  })
})
