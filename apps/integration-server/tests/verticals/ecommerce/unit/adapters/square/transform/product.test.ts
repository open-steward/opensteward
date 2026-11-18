import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  untransformProduct,
  type RawSquareCatalogItem,
} from '../../../../../../../src/verticals/ecommerce/adapters/square/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeItem(overrides: Partial<RawSquareCatalogItem> = {}): RawSquareCatalogItem {
  return {
    id: 'ITEM_ABC123',
    type: 'ITEM',
    item_data: {
      name: 'Espresso',
      description: 'Double-shot espresso',
      product_type: 'REGULAR',
      variations: [
        {
          id: 'VAR_001',
          item_variation_data: {
            item_id: 'ITEM_ABC123',
            name: 'Small',
            sku: 'ESP-SM',
            upc: '111222333',
            pricing_type: 'FIXED_PRICING',
            price_money: { amount: 350, currency: 'USD' },
            ordinal: 1,
          },
        },
        {
          id: 'VAR_002',
          item_variation_data: {
            item_id: 'ITEM_ABC123',
            name: 'Large',
            sku: 'ESP-LG',
            pricing_type: 'FIXED_PRICING',
            price_money: { amount: 450, currency: 'USD' },
            ordinal: 2,
          },
        },
      ],
      item_options: [
        { item_option_id: 'OPT_1', name: 'Size', values: [{ name: 'Small' }, { name: 'Large' }] },
      ],
    },
    created_at: '2024-01-10T12:00:00Z',
    updated_at: '2024-02-01T09:00:00Z',
    ...overrides,
  }
}

describe('transformProduct (Square)', () => {
  it('maps core fields', () => {
    const result = transformProduct(makeItem())
    expect(result.id).toBe('ITEM_ABC123')
    expect(result.title).toBe('Espresso')
    expect(result.description).toBe('Double-shot espresso')
    expect(result.status).toBe('ACTIVE')
    expect(result.productType).toBe('REGULAR')
  })

  it('maps variants with cent-to-decimal conversion', () => {
    const result = transformProduct(makeItem())
    expect(result.variants).toHaveLength(2)
    const v = result.variants![0]!
    expect(v.id).toBe('VAR_001')
    expect(v.productId).toBe('ITEM_ABC123')
    expect(v.sku).toBe('ESP-SM')
    expect(v.price).toEqual({ amount: 350, currency: 'USD' })
    expect(v.position).toBe(1)
  })

  it('maps options', () => {
    const result = transformProduct(makeItem())
    expect(result.options).toHaveLength(1)
    expect(result.options![0]!.name).toBe('Size')
    expect(result.options![0]!.values).toEqual(['Small', 'Large'])
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeItem()
    const result = transformProduct(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies ProductSchema', () => {
    const result = transformProduct(makeItem())
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })

  it('marks deleted items as ARCHIVED', () => {
    const result = transformProduct(makeItem({ is_deleted: true }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('round-trips writable fields via untransformProduct', () => {
    const canonical = transformProduct(makeItem())
    const raw = untransformProduct(canonical)
    expect((raw['item_data'] as Record<string, unknown>)['name']).toBe('Espresso')
    expect(raw['type']).toBe('ITEM')
  })
})
