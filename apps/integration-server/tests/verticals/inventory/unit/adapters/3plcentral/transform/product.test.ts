import { describe, it, expect } from 'vitest'
import { transformProduct } from '../../../../../../../src/verticals/inventory/adapters/3plcentral/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

describe('transformProduct', () => {
  const raw = {
    readOnly: {
      itemId: 101,
      creationDate: '2024-03-01T00:00:00Z',
      lastModifiedDate: '2024-03-01T00:00:00Z',
      deactivated: false,
    },
    sku: 'WK-2026',
    description: 'Wireless Keyboard',
    options: {
      packageUnit: {
        imperial: { weight: 1.0 },
      },
    },
  }
  const result = transformProduct(raw)

  it('sets sku', () => {
    expect(result.sku).toBe('WK-2026')
  })

  it('sets platform to 3plcentral', () => {
    expect(result.platform).toBe('3plcentral')
  })

  it('sets isActive from deactivated flag', () => {
    expect(result.isActive).toBe(true)
  })

  it('converts weight from lbs to grams', () => {
    expect(result.weightGrams).toBe(Math.round(1.0 * 453.592))
  })

  it('sets id from readOnly.itemId', () => {
    expect(result.id).toBe('101')
  })

  it('sets name from description', () => {
    expect(result.name).toBe('Wireless Keyboard')
  })

  it('passes schema validation', () => {
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})

describe('transformProduct — deactivated item', () => {
  const raw = {
    readOnly: {
      itemId: 202,
      creationDate: '2024-01-01T00:00:00Z',
      lastModifiedDate: '2024-01-01T00:00:00Z',
      deactivated: true,
    },
    sku: 'OLD-SKU',
    description: 'Obsolete Item',
  }
  const result = transformProduct(raw)

  it('sets isActive to false when deactivated is true', () => {
    expect(result.isActive).toBe(false)
  })

  it('passes schema validation', () => {
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})
