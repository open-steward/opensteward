import { describe, it, expect } from 'vitest'
import { transformProduct } from '../../../../../../../src/verticals/inventory/adapters/pipe17/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

describe('transformProduct — pipe17 item', () => {
  const raw = {
    productId: 'prod_123',
    sku: 'WK-2026',
    name: 'Wireless Keyboard',
    description: 'Bluetooth wireless keyboard',
    status: 'active',
    upc: '0123456789012',
    brand: 'Keyboards Inc',
    category: 'Peripherals',
    unitOfMeasure: 'each',
    weight: 1,
    weightUnit: 'lb',
    parentExtProductId: 'prod_parent',
    tags: ['featured', 'sale'],
    types: ['physical'],
    createdAt: '2024-03-01T00:00:00Z',
    updatedAt: '2024-03-01T00:00:00Z',
  }
  const result = transformProduct(raw)

  it('sets id from productId', () => {
    expect(result.id).toBe('prod_123')
  })

  it('sets externalId matching id', () => {
    expect(result.externalId).toBe('prod_123')
  })

  it('sets sku from raw.sku', () => {
    expect(result.sku).toBe('WK-2026')
  })

  it('sets name from raw.name', () => {
    expect(result.name).toBe('Wireless Keyboard')
  })

  it('sets upc', () => {
    expect(result.upc).toBe('0123456789012')
  })

  it('sets brand', () => {
    expect(result.brand).toBe('Keyboards Inc')
  })

  it('sets category', () => {
    expect(result.category).toBe('Peripherals')
  })

  it('sets unitOfMeasure from raw.unitOfMeasure', () => {
    expect(result.unitOfMeasure).toBe('each')
  })

  it('converts weight from lbs to grams (1 lb ≈ 453.592 g)', () => {
    expect(result.weightGrams).toBeCloseTo(453.592)
  })

  it('sets parentProductId from parentExtProductId', () => {
    expect(result.parentProductId).toBe('prod_parent')
  })

  it('derives isActive from status not being inactive/archived', () => {
    expect(result.isActive).toBe(true)
  })

  it('sets supplierIds to empty array (not available in Pipe17 item)', () => {
    expect(result.supplierIds).toEqual([])
  })

  it('sets createdAt and updatedAt as ISO strings', () => {
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
    expect(result.updatedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to pipe17', () => {
    expect(result.platform).toBe('pipe17')
  })

  it('stores tags as comma-joined string in metadata', () => {
    expect(result.metadata['tags']).toBe('featured,sale')
  })

  it('passes schema validation', () => {
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})

describe('transformProduct — status=inactive', () => {
  const result = transformProduct({
    productId: 'p2',
    sku: 'SKU-2',
    name: 'Old Product',
    status: 'inactive',
  })

  it('sets isActive to false when status is inactive', () => {
    expect(result.isActive).toBe(false)
  })

  it('passes schema validation', () => {
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})

describe('transformProduct — weight in kg', () => {
  const result = transformProduct({
    productId: 'p3',
    sku: 'SKU-3',
    name: 'Heavy Item',
    weight: 2,
    weightUnit: 'kg',
  })

  it('converts weight from kg to grams (2 kg = 2000 g)', () => {
    expect(result.weightGrams).toBe(2000)
  })
})

describe('transformProduct — fallback id to sku', () => {
  const result = transformProduct({ sku: 'SKU-ONLY', name: 'No Product ID' })

  it('falls back id to sku when productId absent', () => {
    expect(result.id).toBe('SKU-ONLY')
  })
})
