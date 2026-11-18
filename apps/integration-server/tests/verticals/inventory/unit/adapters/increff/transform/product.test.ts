import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawIncreffProduct,
} from '../../../../../../../src/verticals/inventory/adapters/increff/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

describe('increff transformProduct', () => {
  const raw: RawIncreffProduct = {
    skuCode: 'SKU-001',
    increffSkuCode: 'INC-SKU-001',
    name: 'Blue Denim Jeans',
    description: 'Slim fit blue denim jeans',
    ean: '8901234567890',
    brand: 'DenimCo',
    category: 'Apparel',
    weight: 400,
    mrp: 1999,
    currency: 'INR',
    status: 'active',
    supplierCode: 'SUP-DC-01',
    createdOn: '2024-03-01T00:00:00Z',
  }

  it('maps id from skuCode', () => {
    const result = transformProduct(raw)
    expect(result.id).toBe('SKU-001')
    expect(result.sku).toBe('SKU-001')
  })

  it('maps externalId from increffSkuCode', () => {
    const result = transformProduct(raw)
    expect(result.externalId).toBe('INC-SKU-001')
  })

  it('maps name', () => {
    const result = transformProduct(raw)
    expect(result.name).toBe('Blue Denim Jeans')
  })

  it('maps upc from ean', () => {
    const result = transformProduct(raw)
    expect(result.upc).toBe('8901234567890')
  })

  it('maps retailPrice as decimal (not minor units)', () => {
    const result = transformProduct(raw)
    expect(result.retailPrice?.amount).toBe(1999)
    expect(result.retailPrice?.currency).toBe('INR')
  })

  it('maps weightGrams', () => {
    const result = transformProduct(raw)
    expect(result.weightGrams).toBe(400)
  })

  it('maps supplierIds from supplierCode', () => {
    const result = transformProduct(raw)
    expect(result.supplierIds).toEqual(['SUP-DC-01'])
  })

  it('sets isActive true when status is not inactive', () => {
    const result = transformProduct(raw)
    expect(result.isActive).toBe(true)
  })

  it('sets isActive false when status is inactive', () => {
    const result = transformProduct({ ...raw, status: 'inactive' })
    expect(result.isActive).toBe(false)
  })

  it('sets platform to increff', () => {
    const result = transformProduct(raw)
    expect(result.platform).toBe('increff')
  })

  it('produces output that satisfies ProductSchema', () => {
    const result = transformProduct(raw)
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})
