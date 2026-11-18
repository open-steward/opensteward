import { describe, it, expect } from 'vitest'
import {
  transformVariant,
  type RawEbayInventoryItemGroup,
} from '../../../../../../../src/verticals/ecommerce/adapters/ebay/transform/variant'
import type { RawEbayInventoryItem } from '../../../../../../../src/verticals/ecommerce/adapters/ebay/transform/product'
import { ProductVariantSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeItem(overrides: Partial<RawEbayInventoryItem> = {}): RawEbayInventoryItem {
  return {
    sku: 'WIDGET-001-BLK',
    locale: 'en_US',
    product: {
      title: 'Stainless Steel Widget - Black',
      aspects: {
        Color: ['Black'],
        Size: ['Large'],
      },
    },
    condition: 'NEW',
    availability: {
      shipToLocationAvailability: {
        quantity: 12,
      },
    },
    packageWeightAndSize: {
      weight: { value: 1.5, unit: 'POUND' },
    },
    inventoryItemGroupKeys: ['GROUP-001'],
    ...overrides,
  }
}

describe('transformVariant (eBay)', () => {
  it('uses the SKU as the canonical id and sku', () => {
    const result = transformVariant(makeItem())
    expect(result.id).toBe('WIDGET-001-BLK')
    expect(result.sku).toBe('WIDGET-001-BLK')
    expect(result.title).toBe('Stainless Steel Widget - Black')
  })

  it('takes productId from the explicit argument when supplied', () => {
    const result = transformVariant(makeItem(), 'GROUP-CALLER')
    expect(result.productId).toBe('GROUP-CALLER')
  })

  it('falls back to inventoryItemGroupKeys when no productId argument is given', () => {
    const result = transformVariant(makeItem())
    expect(result.productId).toBe('GROUP-001')
  })

  it('leaves productId undefined when the item has no group at all', () => {
    const result = transformVariant(makeItem({ inventoryItemGroupKeys: undefined }))
    expect(result.productId).toBeUndefined()
  })

  it('maps aspects to optionValues, taking the first value of each', () => {
    const result = transformVariant(makeItem())
    expect(result.optionValues).toEqual({ Color: 'Black', Size: 'Large' })
  })

  it('maps packageWeightAndSize to weight/weightUnit', () => {
    const result = transformVariant(makeItem())
    expect(result.weight).toBe(1.5)
    expect(result.weightUnit).toBe('lb')
  })

  it('defaults price to zero — eBay has no price on inventory_item', () => {
    const result = transformVariant(makeItem())
    expect(result.price).toEqual({ amount: 0, currency: 'USD' })
  })

  it('preserves the raw item in metadata', () => {
    const raw = makeItem()
    const result = transformVariant(raw)
    expect(result.metadata['sku']).toBe('WIDGET-001-BLK')
  })

  it('produces a payload that satisfies ProductVariantSchema', () => {
    const result = transformVariant(makeItem(), 'GROUP-001')
    expect(() => ProductVariantSchema.parse(result)).not.toThrow()
  })

  it('round-trips through ProductVariantSchema unchanged on the fields that matter', () => {
    const result = transformVariant(makeItem(), 'GROUP-001')
    const parsed = ProductVariantSchema.parse(result)
    expect(parsed.id).toBe('WIDGET-001-BLK')
    expect(parsed.productId).toBe('GROUP-001')
  })
})

describe('RawEbayInventoryItemGroup shape (sanity)', () => {
  it('accepts the documented InventoryItemGroup fields', () => {
    const group: RawEbayInventoryItemGroup = {
      inventoryItemGroupKey: 'GROUP-001',
      title: 'Stainless Steel Widget',
      variantSKUs: ['WIDGET-001-BLK', 'WIDGET-001-WHT'],
    }
    expect(group.variantSKUs).toHaveLength(2)
  })
})
