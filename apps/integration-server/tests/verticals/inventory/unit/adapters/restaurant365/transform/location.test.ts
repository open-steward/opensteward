import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawR365Location,
} from '../../../../../../../src/verticals/inventory/adapters/restaurant365/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

describe('restaurant365 transformLocation', () => {
  const raw: RawR365Location = {
    locationId: 'loc-guid-001',
    name: 'Downtown Bistro',
    locationNumber: 'DB-01',
    legalEntityId: 'le-guid-001',
    legalEntityNumber: 'LE-001',
    legalEntityName: 'Bistro Group LLC',
    attribute1Id: 'attr1-guid',
    attribute1Number: 'A1-01',
    attribute1Name: 'Region: West',
    attribute2Id: 'attr2-guid',
    attribute2Number: 'A2-01',
    attribute2Name: 'District: Downtown',
    createdBy: 'admin',
    createdOn: '2024-03-01T00:00:00Z',
    modifiedBy: 'manager',
    modifiedOn: '2024-03-01T00:00:00Z',
  }

  it('maps locationId to id and externalId', () => {
    const result = transformLocation(raw)
    expect(result.id).toBe('loc-guid-001')
    expect(result.externalId).toBe('loc-guid-001')
  })

  it('maps name, code and type to store', () => {
    const result = transformLocation(raw)
    expect(result.name).toBe('Downtown Bistro')
    expect(result.code).toBe('DB-01')
    expect(result.type).toBe('store')
  })

  it('maps parentLocationId from legalEntityId', () => {
    const result = transformLocation(raw)
    expect(result.parentLocationId).toBe('le-guid-001')
  })

  it('always sets isActive to true and address to undefined', () => {
    const result = transformLocation(raw)
    expect(result.isActive).toBe(true)
    expect(result.address).toBeUndefined()
  })

  it('stores legalEntity info in metadata', () => {
    const result = transformLocation(raw)
    expect(result.metadata['legalEntityId']).toBe('le-guid-001')
    expect(result.metadata['legalEntityName']).toBe('Bistro Group LLC')
  })

  it('produces output that satisfies LocationSchema', () => {
    const result = transformLocation(raw)
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
