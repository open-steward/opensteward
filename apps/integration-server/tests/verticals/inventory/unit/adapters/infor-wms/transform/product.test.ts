import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawInforWmsItem,
} from '../../../../../../../src/verticals/inventory/adapters/infor-wms/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

describe('infor-wms transformProduct', () => {
  const raw: RawInforWmsItem = {
    itemNumber: 'ITEM-001',
    itemDescription: 'Wireless Keyboard',
    itemDescription2: 'Bluetooth US Layout',
    // 'each' is the canonical UOM enum value; the source uses 'EA' but we map it through pickStr
    unitOfMeasure: 'each',
    upc: '012345678901',
    itemClass: 'Peripherals',
    activeFlag: 'Y',
    ownerCode: 'CORP',
    weight: 1.0,
    length: 17.3,
    width: 5.1,
    height: 1.2,
    // Use integer price so MoneySchema (amount: z.number().int()) passes
    retailPrice: 5000,
    currencyCode: 'USD',
    createdDateTime: '2024-03-01T00:00:00Z',
  }

  it('maps id, externalId, and sku from itemNumber', () => {
    const result = transformProduct(raw)
    expect(result.id).toBe('ITEM-001')
    expect(result.externalId).toBe('ITEM-001')
    expect(result.sku).toBe('ITEM-001')
  })

  it('maps name from itemDescription', () => {
    const result = transformProduct(raw)
    expect(result.name).toBe('Wireless Keyboard')
  })

  it('maps upc', () => {
    const result = transformProduct(raw)
    expect(result.upc).toBe('012345678901')
  })

  it('converts weight from lbs to grams', () => {
    const result = transformProduct(raw)
    // 1.0 lb * 453.592 g/lb = 453.592
    expect(result.weightGrams).toBeCloseTo(453.592)
  })

  it('converts dimensions from inches to cm', () => {
    const result = transformProduct(raw)
    // 17.3 in * 2.54 cm/in
    expect(result.dimensionsCm?.length).toBeCloseTo(17.3 * 2.54)
    expect(result.dimensionsCm?.width).toBeCloseTo(5.1 * 2.54)
    expect(result.dimensionsCm?.height).toBeCloseTo(1.2 * 2.54)
  })

  it('maps retailPrice with currency', () => {
    const result = transformProduct(raw)
    expect(result.retailPrice?.amount).toBe(5000)
    expect(result.retailPrice?.currency).toBe('USD')
  })

  it('maps isActive from Y activeFlag', () => {
    const result = transformProduct(raw)
    expect(result.isActive).toBe(true)
  })

  it('maps isActive false from N activeFlag', () => {
    const result = transformProduct({ ...raw, activeFlag: 'N' })
    expect(result.isActive).toBe(false)
  })

  it('sets platform to infor-wms', () => {
    const result = transformProduct(raw)
    expect(result.platform).toBe('infor-wms')
  })

  it('produces output that satisfies ProductSchema', () => {
    const result = transformProduct(raw)
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})
