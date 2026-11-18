import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawEpicorKineticWarehouse,
} from '../../../../../../../src/verticals/inventory/adapters/epicor-kinetic/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

describe('epicor-kinetic transformLocation', () => {
  const raw: RawEpicorKineticWarehouse = {
    WarehouseCode: 'WH-MAIN',
    Description: 'Main Warehouse',
    Inactive: false,
    Plant: 'PLANT-A',
    Address1: '100 Industrial Blvd',
    Address2: 'Suite 5',
    City: 'Austin',
    State: 'TX',
    ZIP: '78701',
    Country: 'US',
    SysRowID: 'guid-wh-001',
  }

  it('maps id and code from WarehouseCode', () => {
    const result = transformLocation(raw)
    expect(result.id).toBe('WH-MAIN')
    expect(result.code).toBe('WH-MAIN')
  })

  it('maps externalId from SysRowID', () => {
    const result = transformLocation(raw)
    expect(result.externalId).toBe('guid-wh-001')
  })

  it('maps name from Description', () => {
    const result = transformLocation(raw)
    expect(result.name).toBe('Main Warehouse')
  })

  it('sets type to warehouse', () => {
    const result = transformLocation(raw)
    expect(result.type).toBe('warehouse')
  })

  it('maps parentLocationId from Plant', () => {
    const result = transformLocation(raw)
    expect(result.parentLocationId).toBe('PLANT-A')
  })

  it('maps address fields', () => {
    const result = transformLocation(raw)
    expect(result.address?.line1).toBe('100 Industrial Blvd')
    expect(result.address?.city).toBe('Austin')
    expect(result.address?.region).toBe('TX')
    expect(result.address?.postalCode).toBe('78701')
    expect(result.address?.country).toBe('US')
  })

  it('sets isActive true when Inactive is false', () => {
    const result = transformLocation(raw)
    expect(result.isActive).toBe(true)
  })

  it('sets isActive false when Inactive is true', () => {
    const result = transformLocation({ ...raw, Inactive: true })
    expect(result.isActive).toBe(false)
  })

  it('leaves address undefined when no address fields present', () => {
    const result = transformLocation({ WarehouseCode: 'WH-EMPTY', Description: 'Empty' })
    expect(result.address).toBeUndefined()
  })

  it('sets platform to epicor-kinetic', () => {
    const result = transformLocation(raw)
    expect(result.platform).toBe('epicor-kinetic')
  })

  it('produces output that satisfies LocationSchema', () => {
    const result = transformLocation(raw)
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
