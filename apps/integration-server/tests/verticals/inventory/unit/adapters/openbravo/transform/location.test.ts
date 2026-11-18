import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawOpenbravoWarehouse,
} from '../../../../../../../src/verticals/inventory/adapters/openbravo/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

describe('openbravo transformLocation', () => {
  const raw: RawOpenbravoWarehouse = {
    id: 'wh-uuid-001',
    searchKey: 'WH001',
    name: 'Main Warehouse',
    active: true,
    organization: { id: 'org-001', _identifier: 'Acme Corp' },
    locationAddress: {
      addressLine1: '100 Commerce St',
      addressLine2: 'Dock 3',
      cityName: 'Austin',
      region: 'TX',
      countryId: { _identifier: 'US' },
      postalCode: '78701',
    },
    creationDate: '2024-03-01T00:00:00Z',
    updated: '2024-03-01T00:00:00Z',
  }

  it('maps id and externalId', () => {
    const result = transformLocation(raw)
    expect(result.id).toBe('wh-uuid-001')
    expect(result.externalId).toBe('wh-uuid-001')
  })

  it('maps name', () => {
    const result = transformLocation(raw)
    expect(result.name).toBe('Main Warehouse')
  })

  it('maps code from searchKey', () => {
    const result = transformLocation(raw)
    expect(result.code).toBe('WH001')
  })

  it('sets type to warehouse', () => {
    const result = transformLocation(raw)
    expect(result.type).toBe('warehouse')
  })

  it('maps address fields from locationAddress', () => {
    const result = transformLocation(raw)
    expect(result.address?.line1).toBe('100 Commerce St')
    expect(result.address?.city).toBe('Austin')
    expect(result.address?.region).toBe('TX')
    expect(result.address?.country).toBe('US')
    expect(result.address?.postalCode).toBe('78701')
  })

  it('maps isActive from active boolean', () => {
    const result = transformLocation(raw)
    expect(result.isActive).toBe(true)
  })

  it('maps isActive from active string "Y"', () => {
    const result = transformLocation({ ...raw, active: 'Y' })
    expect(result.isActive).toBe(true)
  })

  it('sets platform to openbravo', () => {
    const result = transformLocation(raw)
    expect(result.platform).toBe('openbravo')
  })

  it('produces output that satisfies LocationSchema', () => {
    const result = transformLocation(raw)
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
