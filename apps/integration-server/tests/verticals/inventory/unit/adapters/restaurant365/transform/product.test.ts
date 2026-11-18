import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawR365Item,
} from '../../../../../../../src/verticals/inventory/adapters/restaurant365/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

describe('restaurant365 transformProduct', () => {
  const raw: RawR365Item = {
    itemId: 'item-guid-001',
    name: 'Beef Brisket',
    itemNumber: 'BRISKET-001',
    category1: 'Proteins',
    category2: 'Meats',
    category3: 'Beef',
    createdBy: 'admin',
    createdOn: '2024-03-01T00:00:00Z',
    modifiedBy: 'chef',
    modifiedOn: '2024-03-01T00:00:00Z',
  }

  it('maps itemId to id and externalId', () => {
    const result = transformProduct(raw)
    expect(result.id).toBe('item-guid-001')
    expect(result.externalId).toBe('item-guid-001')
  })

  it('maps itemNumber to sku and name', () => {
    const result = transformProduct(raw)
    expect(result.sku).toBe('BRISKET-001')
    expect(result.name).toBe('Beef Brisket')
  })

  it('maps category1 to category', () => {
    const result = transformProduct(raw)
    expect(result.category).toBe('Proteins')
  })

  it('stores category2 and category3 in metadata', () => {
    const result = transformProduct(raw)
    expect(result.metadata['category2']).toBe('Meats')
    expect(result.metadata['category3']).toBe('Beef')
  })

  it('maps createdAt and updatedAt as ISO strings', () => {
    const result = transformProduct(raw)
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
    expect(result.updatedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('always sets isActive to true', () => {
    const result = transformProduct(raw)
    expect(result.isActive).toBe(true)
  })

  it('sets unitOfMeasure to "each"', () => {
    const result = transformProduct(raw)
    expect(result.unitOfMeasure).toBe('each')
  })

  it('leaves optional product fields undefined', () => {
    const result = transformProduct(raw)
    expect(result.description).toBeUndefined()
    expect(result.upc).toBeUndefined()
    expect(result.brand).toBeUndefined()
    expect(result.retailPrice).toBeUndefined()
    expect(result.supplierIds).toEqual([])
  })

  it('produces output that satisfies ProductSchema', () => {
    const result = transformProduct(raw)
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})
