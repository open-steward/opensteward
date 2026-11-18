import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawPeoplevoxItemType,
} from '../../../../../../../src/verticals/inventory/adapters/peoplevox/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

describe('transformProduct — peoplevox', () => {
  const raw: RawPeoplevoxItemType = {
    ItemCode: 'WK-2026',
    Name: 'Wireless Keyboard',
    Barcode: '0123456789012',
    Description: 'Bluetooth wireless keyboard',
    ItemGroup: 'Peripherals',
    UnitOfMeasure: 'each',
    RetailPrice: '49.99',
    Weight: '0.45',
    Height: '3',
    Width: '13',
    Depth: '44',
    CreatedDate: '2024-03-01T00:00:00Z',
    LastModifiedDate: '2024-03-01T00:00:00Z',
    DefaultSuppliersPartNumber: 'SUP-WK2026',
    Tags: 'electronics,keyboards',
  }
  const result = transformProduct(raw)

  it('maps id from ItemCode', () => {
    expect(result.id).toBe('WK-2026')
  })

  it('maps sku from ItemCode', () => {
    expect(result.sku).toBe('WK-2026')
  })

  it('maps name from Name', () => {
    expect(result.name).toBe('Wireless Keyboard')
  })

  it('maps upc from Barcode', () => {
    expect(result.upc).toBe('0123456789012')
  })

  it('maps category from ItemGroup', () => {
    expect(result.category).toBe('Peripherals')
  })

  it('maps unitOfMeasure from UnitOfMeasure', () => {
    expect(result.unitOfMeasure).toBe('each')
  })

  it('converts Weight (kg) to grams (*1000)', () => {
    expect(result.weightGrams).toBeCloseTo(450)
  })

  it('maps dimensionsCm using Depth→length, Width→width, Height→height', () => {
    expect(result.dimensionsCm?.length).toBe(44)
    expect(result.dimensionsCm?.width).toBe(13)
    expect(result.dimensionsCm?.height).toBe(3)
  })

  it('converts RetailPrice decimal to integer minor units (*100)', () => {
    expect(result.retailPrice?.amount).toBe(4999)
    expect(result.retailPrice?.currency).toBe('GBP')
  })

  it('maps createdAt from CreatedDate via toIso', () => {
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps updatedAt from LastModifiedDate via toIso', () => {
    expect(result.updatedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to peoplevox', () => {
    expect(result.platform).toBe('peoplevox')
  })

  it('stores tags in metadata', () => {
    expect(result.metadata['tags']).toBe('electronics,keyboards')
  })

  it('passes schema validation', () => {
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})

describe('transformProduct — peoplevox defaults when optional fields absent', () => {
  const raw: RawPeoplevoxItemType = {
    ItemCode: 'MIN-SKU',
  }
  const result = transformProduct(raw)

  it('falls back sku to ItemCode', () => {
    expect(result.sku).toBe('MIN-SKU')
  })

  it('defaults unitOfMeasure to each when UnitOfMeasure absent', () => {
    expect(result.unitOfMeasure).toBe('each')
  })

  it('leaves retailPrice undefined when RetailPrice absent', () => {
    expect(result.retailPrice).toBeUndefined()
  })

  it('leaves weightGrams undefined when Weight absent', () => {
    expect(result.weightGrams).toBeUndefined()
  })

  it('leaves dimensionsCm undefined when dimension fields absent', () => {
    expect(result.dimensionsCm).toBeUndefined()
  })

  it('passes schema validation', () => {
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})
