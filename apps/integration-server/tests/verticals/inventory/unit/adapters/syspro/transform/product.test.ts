import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawSysproProduct,
} from '../../../../../../../src/verticals/inventory/adapters/syspro/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

function makeRaw(overrides: Partial<RawSysproProduct> = {}): RawSysproProduct {
  return {
    StockCode: 'WIDGET-RED',
    Description: 'Red Widget',
    LongDescription: 'A premium red widget for industrial use',
    ProductClass: 'WIDGETS',
    Uom: 'each',
    AlternateUom: 'BOX',
    Mass: 0.5,
    Volume: 0.001,
    ListPrice: 29.99,
    PriceCode: 'A',
    PrimarySupplier: 'SUP001',
    Buyer: 'John',
    StockCodeStatus: 'N',
    AlternateKey1: '0123456789012',
    AlternateKey2: 'RWIDG',
    UserField1: 'custom1',
    DateOfSupersession: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformProduct (syspro)', () => {
  it('maps id, externalId, and sku from StockCode', () => {
    const result = transformProduct(makeRaw())
    expect(result.id).toBe('WIDGET-RED')
    expect(result.externalId).toBe('WIDGET-RED')
    expect(result.sku).toBe('WIDGET-RED')
  })

  it('maps name from Description, falling back to StockCode', () => {
    const result = transformProduct(makeRaw())
    expect(result.name).toBe('Red Widget')

    const resultNoDesc = transformProduct(makeRaw({ Description: undefined }))
    expect(resultNoDesc.name).toBe('WIDGET-RED')
  })

  it('maps description from LongDescription', () => {
    const result = transformProduct(makeRaw())
    expect(result.description).toBe('A premium red widget for industrial use')
  })

  it('maps upc from AlternateKey1', () => {
    const result = transformProduct(makeRaw())
    expect(result.upc).toBe('0123456789012')
  })

  it('maps category from ProductClass', () => {
    const result = transformProduct(makeRaw())
    expect(result.category).toBe('WIDGETS')
  })

  it('converts Mass in kg to grams for weightGrams', () => {
    const result = transformProduct(makeRaw({ Mass: 0.5 }))
    expect(result.weightGrams).toBe(500)
  })

  it('isActive is true when StockCodeStatus is "N"', () => {
    const result = transformProduct(makeRaw({ StockCodeStatus: 'N' }))
    expect(result.isActive).toBe(true)
  })

  it('isActive is false when StockCodeStatus is "C"', () => {
    const result = transformProduct(makeRaw({ StockCodeStatus: 'C' }))
    expect(result.isActive).toBe(false)
  })

  it('maps supplierIds from PrimarySupplier', () => {
    const result = transformProduct(makeRaw())
    expect(result.supplierIds).toContain('SUP001')
  })

  it('retailPrice is undefined (SYSPRO omits currency on InvMaster)', () => {
    const result = transformProduct(makeRaw())
    expect(result.retailPrice).toBeUndefined()
  })

  it('platform is "syspro"', () => {
    const result = transformProduct(makeRaw())
    expect(result.platform).toBe('syspro')
  })

  it('passes ProductSchema validation', () => {
    const result = transformProduct(makeRaw())
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})
