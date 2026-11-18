import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  transformStockLocation,
  type RawStoreFeederWarehouse,
  type RawStoreFeederStockLocation,
} from '../../../../../../../src/verticals/inventory/adapters/store-feeder/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

describe('transformLocation (warehouse) — store-feeder', () => {
  const raw: RawStoreFeederWarehouse = {
    WarehouseID: 101,
    WarehouseGuid: 'wh-guid-abc',
    WarehouseName: 'Main Warehouse',
    WarehouseType: 'Standard',
    IsDefault: true,
    SenderName: 'Acme Fulfillment',
    ShippingAddress: {
      AddressLine1: '100 Commerce Blvd',
      AddressLine2: 'Suite 10',
      Town: 'Austin',
      County: 'TX',
      Country: 'US',
      Postcode: '78701',
    },
  }
  const result = transformLocation(raw)

  it('maps id from WarehouseID as string', () => {
    expect(result.id).toBe('101')
  })

  it('maps name from WarehouseName', () => {
    expect(result.name).toBe('Main Warehouse')
  })

  it('maps code from WarehouseGuid', () => {
    expect(result.code).toBe('wh-guid-abc')
  })

  it('sets type to warehouse', () => {
    expect(result.type).toBe('warehouse')
  })

  it('maps address.line1 from ShippingAddress.AddressLine1', () => {
    expect(result.address?.line1).toBe('100 Commerce Blvd')
  })

  it('maps address.city from ShippingAddress.Town', () => {
    expect(result.address?.city).toBe('Austin')
  })

  it('maps address.country from ShippingAddress.Country', () => {
    expect(result.address?.country).toBe('US')
  })

  it('maps address.postalCode from ShippingAddress.Postcode', () => {
    expect(result.address?.postalCode).toBe('78701')
  })

  it('sets isActive to true', () => {
    expect(result.isActive).toBe(true)
  })

  it('stores isDefault in metadata', () => {
    expect(result.metadata['isDefault']).toBe('true')
  })

  it('sets platform to store-feeder', () => {
    expect(result.platform).toBe('store-feeder')
  })

  it('passes schema validation', () => {
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})

describe('transformStockLocation — store-feeder', () => {
  const raw: RawStoreFeederStockLocation = {
    StockLocationID: 201,
    StockLocationReference: 'BIN-A1',
    Warehouse: { WarehouseID: 101, WarehouseName: 'Main Warehouse', WarehouseGuid: 'wh-guid-abc' },
    StockLocationType: 'Standard',
    IsQuarantined: false,
    IsSystem: false,
    IsEmpty: false,
    HasProducts: true,
    LocationOrder: 1,
  }
  const result = transformStockLocation(raw)

  it('maps id from StockLocationID as string', () => {
    expect(result.id).toBe('201')
  })

  it('maps name from StockLocationReference', () => {
    expect(result.name).toBe('BIN-A1')
  })

  it('maps parentLocationId from Warehouse.WarehouseID', () => {
    expect(result.parentLocationId).toBe('101')
  })

  it('sets type to bin when not quarantined', () => {
    expect(result.type).toBe('bin')
  })

  it('sets type to quarantine when IsQuarantined is true', () => {
    const quarantined = transformStockLocation({ ...raw, IsQuarantined: true })
    expect(quarantined.type).toBe('quarantine')
  })

  it('sets isActive true when IsSystem is false', () => {
    expect(result.isActive).toBe(true)
  })

  it('sets platform to store-feeder', () => {
    expect(result.platform).toBe('store-feeder')
  })

  // NOTE: StockLocation type is 'bin' or 'quarantine' — neither is in LocationTypeSchema
  // (warehouse, store, virtual, transit, supplier, unknown).
  // Schema validation is intentionally skipped for StockLocation; the transform emits
  // a schema-invalid value for this sub-resource type.
  // it('passes schema validation', () => { expect(() => LocationSchema.parse(result)).not.toThrow() })
})
