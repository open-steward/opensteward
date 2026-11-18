import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawOpenboxesProduct,
} from '../../../../../../../src/verticals/inventory/adapters/openboxes/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

describe('openboxes transformProduct', () => {
  const raw: RawOpenboxesProduct = {
    id: 'prod-001',
    productCode: 'WK-2026',
    name: 'Wireless Keyboard',
    description: 'Bluetooth wireless keyboard',
    category: { id: 'cat-1', name: 'Peripherals' },
    unitOfMeasure: 'each',
    active: true,
    dateCreated: '2024-03-01T00:00:00Z',
    lastUpdated: '2024-03-01T00:00:00Z',
  }

  it('maps id and externalId', () => {
    const result = transformProduct(raw)
    expect(result.id).toBe('prod-001')
    expect(result.externalId).toBe('prod-001')
  })

  it('maps sku from productCode', () => {
    const result = transformProduct(raw)
    expect(result.sku).toBe('WK-2026')
  })

  it('maps name', () => {
    const result = transformProduct(raw)
    expect(result.name).toBe('Wireless Keyboard')
  })

  it('maps category from category.name', () => {
    const result = transformProduct(raw)
    expect(result.category).toBe('Peripherals')
  })

  it('maps unitOfMeasure', () => {
    const result = transformProduct(raw)
    expect(result.unitOfMeasure).toBe('each')
  })

  it('maps isActive from active field', () => {
    const result = transformProduct(raw)
    expect(result.isActive).toBe(true)
  })

  it('maps createdAt from dateCreated', () => {
    const result = transformProduct(raw)
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps updatedAt from lastUpdated', () => {
    const result = transformProduct(raw)
    expect(result.updatedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to openboxes', () => {
    const result = transformProduct(raw)
    expect(result.platform).toBe('openboxes')
  })

  it('produces output that satisfies ProductSchema', () => {
    const result = transformProduct(raw)
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})
