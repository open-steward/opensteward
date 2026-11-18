import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawDeckCommerceLocation,
} from '../../../../../../../src/verticals/inventory/adapters/deck-commerce/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

describe('deck-commerce transformLocation', () => {
  const raw: RawDeckCommerceLocation = {
    WarehouseCode: 'WH1',
    WarehouseName: 'Primary Warehouse',
    IsActive: true,
    IsDefault: true,
    Address: {
      Address1: '1 Commerce Way',
      Address2: 'Suite 100',
      City: 'Chicago',
      State: 'IL',
      Country: 'US',
      ZipCode: '60601',
    },
  }

  it('maps id, externalId, and code from WarehouseCode', () => {
    const result = transformLocation(raw)
    expect(result.id).toBe('WH1')
    expect(result.externalId).toBe('WH1')
    expect(result.code).toBe('WH1')
  })

  it('maps name from WarehouseName', () => {
    const result = transformLocation(raw)
    expect(result.name).toBe('Primary Warehouse')
  })

  it('falls back to WarehouseCode for name when WarehouseName absent', () => {
    const result = transformLocation({ WarehouseCode: 'WH2' })
    expect(result.name).toBe('WH2')
  })

  it('sets type to warehouse', () => {
    const result = transformLocation(raw)
    expect(result.type).toBe('warehouse')
  })

  it('maps address fields when Address provided', () => {
    const result = transformLocation(raw)
    expect(result.address?.line1).toBe('1 Commerce Way')
    expect(result.address?.city).toBe('Chicago')
    expect(result.address?.country).toBe('US')
    expect(result.address?.postalCode).toBe('60601')
  })

  it('leaves address undefined when Address absent', () => {
    const result = transformLocation({ WarehouseCode: 'WH3' })
    expect(result.address).toBeUndefined()
  })

  it('maps isActive from IsActive flag', () => {
    const result = transformLocation(raw)
    expect(result.isActive).toBe(true)
  })

  it('defaults isActive to true when IsActive absent', () => {
    const result = transformLocation({ WarehouseCode: 'WH4' })
    expect(result.isActive).toBe(true)
  })

  it('sets platform to deck-commerce', () => {
    const result = transformLocation(raw)
    expect(result.platform).toBe('deck-commerce')
  })

  it('produces output that satisfies LocationSchema', () => {
    const result = transformLocation(raw)
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
