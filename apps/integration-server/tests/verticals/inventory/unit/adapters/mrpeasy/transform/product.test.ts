import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawMrpeasyProduct,
} from '../../../../../../../src/verticals/inventory/adapters/mrpeasy/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

describe('mrpeasy transformProduct', () => {
  const raw: RawMrpeasyProduct = {
    article_id: 100,
    code: 'OLV-001',
    title: 'Olive Oil',
    description: 'Cold pressed olive oil',
    barcode: '1234567890',
    unit: 'litre',
    group_title: 'Oils',
    selling_price: 999,
    weight: 0.5,
    deleted: false,
  }

  it('maps id and externalId from article_id as string', () => {
    const result = transformProduct(raw)
    expect(result.id).toBe('100')
    expect(result.externalId).toBe('100')
  })

  it('maps sku from code field', () => {
    const result = transformProduct(raw)
    expect(result.sku).toBe('OLV-001')
  })

  it('maps name from title field', () => {
    const result = transformProduct(raw)
    expect(result.name).toBe('Olive Oil')
  })

  it('maps description', () => {
    const result = transformProduct(raw)
    expect(result.description).toBe('Cold pressed olive oil')
  })

  it('maps upc from barcode', () => {
    const result = transformProduct(raw)
    expect(result.upc).toBe('1234567890')
  })

  it('maps category from group_title', () => {
    const result = transformProduct(raw)
    expect(result.category).toBe('Oils')
  })

  it('maps unitOfMeasure from unit field', () => {
    const result = transformProduct(raw)
    expect(result.unitOfMeasure).toBe('litre')
  })

  it('converts weight from kg to grams', () => {
    const result = transformProduct(raw)
    expect(result.weightGrams).toBe(500)
  })

  it('maps retailPrice from selling_price with USD currency', () => {
    const result = transformProduct(raw)
    expect(result.retailPrice?.amount).toBe(999)
    expect(result.retailPrice?.currency).toBe('USD')
  })

  it('sets isActive true when deleted is false', () => {
    const result = transformProduct(raw)
    expect(result.isActive).toBe(true)
  })

  it('sets isActive false when deleted is true', () => {
    const result = transformProduct({ ...raw, deleted: true })
    expect(result.isActive).toBe(false)
  })

  it('sets platform to mrpeasy', () => {
    const result = transformProduct(raw)
    expect(result.platform).toBe('mrpeasy')
  })

  it('produces output that satisfies ProductSchema', () => {
    const result = transformProduct(raw)
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})
