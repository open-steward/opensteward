import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawD365Warehouse,
} from '../../../../../../../src/verticals/inventory/adapters/dynamics-365-scm/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

describe('dynamics-365-scm transformLocation', () => {
  const raw: RawD365Warehouse = {
    WarehouseId: 'WH-001',
    WarehouseName: 'Main Warehouse',
    SiteId: 'SITE-1',
    DataAreaId: 'USMF',
    IsDefault: false,
    IsQuarantineWarehouse: false,
    AddressStreet: '123 Main St',
    AddressCity: 'Seattle',
    AddressStateId: 'WA',
    AddressCountryRegionId: 'US',
    AddressZipCode: '98101',
  }

  it('maps id and externalId from WarehouseId', () => {
    const result = transformLocation(raw)
    expect(result.id).toBe('WH-001')
    expect(result.externalId).toBe('WH-001')
  })

  it('maps name from WarehouseName', () => {
    const result = transformLocation(raw)
    expect(result.name).toBe('Main Warehouse')
  })

  it('falls back to WarehouseId for name when WarehouseName is absent', () => {
    const result = transformLocation({ ...raw, WarehouseName: undefined })
    expect(result.name).toBe('WH-001')
  })

  it('maps code from WarehouseId', () => {
    const result = transformLocation(raw)
    expect(result.code).toBe('WH-001')
  })

  it('maps type to warehouse when IsQuarantineWarehouse is false', () => {
    const result = transformLocation(raw)
    expect(result.type).toBe('warehouse')
  })

  it('maps type to quarantine when IsQuarantineWarehouse is true', () => {
    const result = transformLocation({ ...raw, IsQuarantineWarehouse: true })
    expect(result.type).toBe('quarantine')
  })

  it('maps parentLocationId from SiteId', () => {
    const result = transformLocation(raw)
    expect(result.parentLocationId).toBe('SITE-1')
  })

  it('maps address fields', () => {
    const result = transformLocation(raw)
    expect(result.address?.line1).toBe('123 Main St')
    expect(result.address?.city).toBe('Seattle')
    expect(result.address?.region).toBe('WA')
    expect(result.address?.country).toBe('US')
    expect(result.address?.postalCode).toBe('98101')
  })

  it('omits address when all address fields are absent', () => {
    const result = transformLocation({
      WarehouseId: 'WH-002',
      WarehouseName: 'Empty',
    })
    expect(result.address).toBeUndefined()
  })

  it('hardcodes isActive to true', () => {
    const result = transformLocation(raw)
    expect(result.isActive).toBe(true)
  })

  it('sets platform to dynamics-365-scm', () => {
    const result = transformLocation(raw)
    expect(result.platform).toBe('dynamics-365-scm')
  })

  it('produces output that satisfies LocationSchema', () => {
    const result = transformLocation(raw)
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
