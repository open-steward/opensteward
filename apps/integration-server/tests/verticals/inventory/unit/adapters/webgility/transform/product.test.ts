import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawWebgilityItem,
} from '../../../../../../../src/verticals/inventory/adapters/webgility/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

const rawItem: RawWebgilityItem = {
  ItemId: 'item-123',
  ItemCode: 'SKU-ABC',
  ItemName: 'Blue Widget',
  Description: 'A standard blue widget',
  IsActive: true,
  IsTaxable: false,
  ItemType: 'Inventory',
  TrackInventory: true,
  QBQtyOnHand: 75,
  SalesDetails: {
    UnitPrice: 19.99,
  },
  CreatedAt: '2024-03-01T00:00:00Z',
  UpdatedAt: '2024-03-01T00:00:00Z',
}

describe('webgility transformProduct', () => {
  it('maps ItemId to id', () => {
    const result = transformProduct(rawItem)
    expect(result.id).toBe('item-123')
    expect(result.externalId).toBe('item-123')
  })

  it('maps ItemCode to sku', () => {
    const result = transformProduct(rawItem)
    expect(result.sku).toBe('SKU-ABC')
  })

  it('maps ItemName to name', () => {
    const result = transformProduct(rawItem)
    expect(result.name).toBe('Blue Widget')
  })

  it('maps Description to description', () => {
    const result = transformProduct(rawItem)
    expect(result.description).toBe('A standard blue widget')
  })

  it('maps SalesDetails.UnitPrice to retailPrice', () => {
    const result = transformProduct(rawItem)
    expect(result.retailPrice?.amount).toBe(1999)
    expect(result.retailPrice?.currency).toBe('USD')
  })

  it('maps IsActive to isActive', () => {
    const result = transformProduct(rawItem)
    expect(result.isActive).toBe(true)
  })

  it('maps ItemType to category', () => {
    const result = transformProduct(rawItem)
    expect(result.category).toBe('Inventory')
  })

  it('sets unitOfMeasure=each (hardcoded for webgility)', () => {
    const result = transformProduct(rawItem)
    expect(result.unitOfMeasure).toBe('each')
  })

  it('maps CreatedAt to createdAt as ISO string', () => {
    const result = transformProduct(rawItem)
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform=webgility', () => {
    const result = transformProduct(rawItem)
    expect(result.platform).toBe('webgility')
  })

  it('produces a schema-valid Product when retailPrice is present', () => {
    const result = transformProduct(rawItem)
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })

  it('produces a schema-valid Product when no SalesDetails price is set', () => {
    const result = transformProduct({ ...rawItem, SalesDetails: undefined })
    expect(result.retailPrice).toBeUndefined()
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })

  it('sets supplierIds to empty array', () => {
    const result = transformProduct(rawItem)
    expect(result.supplierIds).toEqual([])
  })
})
