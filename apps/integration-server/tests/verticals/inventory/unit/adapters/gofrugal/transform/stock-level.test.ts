import { describe, it, expect } from 'vitest'
import {
  transformStockLevel,
  expandStockLevels,
  type RawGofrugalStockLevel,
} from '../../../../../../../src/verticals/inventory/adapters/gofrugal/transform/stock-level'
import type { RawGofrugalProduct } from '../../../../../../../src/verticals/inventory/adapters/gofrugal/transform/product'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

describe('gofrugal transformStockLevel', () => {
  const rawProduct: RawGofrugalProduct = {
    itemId: 101,
    itemName: 'Basmati Rice 5kg',
    locationId: 3,
    stock: [
      { stock: 30, salePrice: 299.99, itemReferenceCode: 'BRC-5KG' },
      { stock: 20, salePrice: 299.99 },
    ],
  }

  const flat: RawGofrugalStockLevel = {
    itemId: 101,
    locationId: 3,
    totalOnHand: 50,
    _raw: rawProduct,
  }

  it('maps id as productId:locationId', () => {
    const result = transformStockLevel(flat)
    expect(result.id).toBe('101:3')
  })

  it('maps productId as string', () => {
    const result = transformStockLevel(flat)
    expect(result.productId).toBe('101')
  })

  it('maps locationId as string', () => {
    const result = transformStockLevel(flat)
    expect(result.locationId).toBe('3')
  })

  it('maps quantityOnHand from totalOnHand', () => {
    const result = transformStockLevel(flat)
    expect(result.quantityOnHand).toBe(50)
  })

  it('sets platform to gofrugal', () => {
    const result = transformStockLevel(flat)
    expect(result.platform).toBe('gofrugal')
  })

  it('expandStockLevels sums stock entries', () => {
    const levels = expandStockLevels(rawProduct)
    expect(levels).toHaveLength(1)
    expect(levels[0]!.totalOnHand).toBe(50)
    expect(levels[0]!.itemId).toBe(101)
    expect(levels[0]!.locationId).toBe(3)
  })

  it('produces output that satisfies StockLevelSchema', () => {
    const result = transformStockLevel(flat)
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})
