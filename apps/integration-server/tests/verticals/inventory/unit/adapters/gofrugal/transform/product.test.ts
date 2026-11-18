import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawGofrugalProduct,
} from '../../../../../../../src/verticals/inventory/adapters/gofrugal/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

describe('gofrugal transformProduct', () => {
  const raw: RawGofrugalProduct = {
    itemId: 101,
    itemName: 'Basmati Rice 5kg',
    locationId: 3,
    stock: [
      {
        stock: 50,
        salePrice: 299.99,
        mrp: 349.99,
        itemReferenceCode: 'BRC-5KG',
        taxPercentage: 5,
      },
    ],
  }

  it('maps id and externalId from itemId as string', () => {
    const result = transformProduct(raw)
    expect(result.id).toBe('101')
    expect(result.externalId).toBe('101')
  })

  it('maps name from itemName', () => {
    const result = transformProduct(raw)
    expect(result.name).toBe('Basmati Rice 5kg')
  })

  it('maps sku from itemReferenceCode of first stock entry', () => {
    const result = transformProduct(raw)
    expect(result.sku).toBe('BRC-5KG')
  })

  it('maps retailPrice in minor units (paise)', () => {
    const result = transformProduct(raw)
    // 299.99 * 100 rounded = 29999
    expect(result.retailPrice?.amount).toBe(29999)
    expect(result.retailPrice?.currency).toBe('INR')
  })

  it('sets platform to gofrugal', () => {
    const result = transformProduct(raw)
    expect(result.platform).toBe('gofrugal')
  })

  it('falls back sku to id when no itemReferenceCode', () => {
    const result = transformProduct({ itemId: 7, stock: [{ stock: 10 }] })
    expect(result.sku).toBe('7')
  })

  it('produces output that satisfies ProductSchema', () => {
    const result = transformProduct(raw)
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})
