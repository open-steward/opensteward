import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformVariant,
  untransformProduct,
  untransformVariant,
  type RawLoyverseItem,
  type RawLoyverseVariant,
} from '../../../../../../../src/verticals/ecommerce/adapters/loyverse/transform/product'
import {
  ProductSchema,
  ProductVariantSchema,
} from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeRawVariant(overrides: Partial<RawLoyverseVariant> = {}): RawLoyverseVariant {
  return {
    variant_id: 'var_001',
    item_id: 'item_001',
    sku: 'WK-BLK',
    barcode: '0123456789012',
    default_price: 9.99,
    option1_value: 'Black',
    created_at: '2024-01-15T09:30:00Z',
    updated_at: '2024-02-01T14:20:00Z',
    ...overrides,
  }
}

function makeRawItem(overrides: Partial<RawLoyverseItem> = {}): RawLoyverseItem {
  return {
    id: 'item_001',
    item_name: 'Wireless Keyboard',
    description: 'A great keyboard',
    handle: 'wireless-keyboard',
    option1_name: 'Color',
    image_url: 'https://cdn.example.com/img/wk.jpg',
    created_at: '2024-01-15T09:30:00Z',
    updated_at: '2024-02-01T14:20:00Z',
    variants: [makeRawVariant()],
    ...overrides,
  }
}

describe('transformVariant (Loyverse)', () => {
  it('maps id, productId, sku, barcode', () => {
    const result = transformVariant(makeRawVariant())
    expect(result.id).toBe('var_001')
    expect(result.productId).toBe('item_001')
    expect(result.sku).toBe('WK-BLK')
    expect(result.barcode).toBe('0123456789012')
  })

  it('converts default_price from major to minor units', () => {
    const result = transformVariant(makeRawVariant({ default_price: 9.99 }))
    expect(result.price).toEqual({ amount: 999, currency: 'USD' })
  })

  it('defaults price to 0 when default_price is null', () => {
    const result = transformVariant(makeRawVariant({ default_price: null }))
    expect(result.price).toEqual({ amount: 0, currency: 'USD' })
  })

  it('maps optionValues from optionNames', () => {
    const result = transformVariant(makeRawVariant(), 'USD', ['Color', null, null])
    expect(result.optionValues).toEqual({ Color: 'Black' })
  })

  it('omits optionValues when no optionNames passed', () => {
    const result = transformVariant(makeRawVariant())
    expect(result.optionValues).toBeUndefined()
  })

  it('produces schema-valid output', () => {
    const result = transformVariant(makeRawVariant())
    expect(() => ProductVariantSchema.parse(result)).not.toThrow()
  })
})

describe('transformProduct (Loyverse)', () => {
  it('maps id and title from item_name', () => {
    const result = transformProduct(makeRawItem())
    expect(result.id).toBe('item_001')
    expect(result.title).toBe('Wireless Keyboard')
  })

  it('maps description and handle', () => {
    const result = transformProduct(makeRawItem())
    expect(result.description).toBe('A great keyboard')
    expect(result.handle).toBe('wireless-keyboard')
  })

  it('builds options from option1_name', () => {
    const result = transformProduct(makeRawItem())
    expect(result.options).toHaveLength(1)
    expect(result.options![0]!.name).toBe('Color')
    expect(result.options![0]!.values).toEqual(['Black'])
    expect(result.options![0]!.position).toBe(0)
  })

  it('returns undefined options when no option names set', () => {
    const result = transformProduct(makeRawItem({ option1_name: null }))
    expect(result.options).toBeUndefined()
  })

  it('maps variants', () => {
    const result = transformProduct(makeRawItem())
    expect(result.variants).toHaveLength(1)
    expect(result.variants![0]!.id).toBe('var_001')
  })

  it('returns undefined variants when variants array is empty', () => {
    const result = transformProduct(makeRawItem({ variants: [] }))
    expect(result.variants).toBeUndefined()
  })

  it('maps image_url to images array', () => {
    const result = transformProduct(makeRawItem())
    expect(result.images).toHaveLength(1)
    expect(result.images![0]!.url).toBe('https://cdn.example.com/img/wk.jpg')
  })

  it('returns undefined images when no image_url', () => {
    const result = transformProduct(makeRawItem({ image_url: null }))
    expect(result.images).toBeUndefined()
  })

  it('maps createdAt and updatedAt', () => {
    const result = transformProduct(makeRawItem())
    expect(result.createdAt).toBe('2024-01-15T09:30:00Z')
    expect(result.updatedAt).toBe('2024-02-01T14:20:00Z')
  })

  it('produces schema-valid output', () => {
    const result = transformProduct(makeRawItem())
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })

  it('produces schema-valid output with minimal input', () => {
    const minimal: RawLoyverseItem = { id: 'item_min', item_name: 'Min Product' }
    const result = transformProduct(minimal)
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})

describe('untransformProduct (Loyverse)', () => {
  it('maps title to item_name', () => {
    const result = untransformProduct({ title: 'Wireless Keyboard' })
    expect(result.item_name).toBe('Wireless Keyboard')
  })

  it('maps option names', () => {
    const result = untransformProduct({
      options: [{ name: 'Color', values: ['Black'] }],
    })
    expect(result.option1_name).toBe('Color')
  })

  it('converts variant price back to major units', () => {
    const result = untransformProduct({
      variants: [{ id: 'var_001', price: { amount: 999, currency: 'USD' }, metadata: {} }],
    })
    const variants = result.variants as Array<{ default_price: number }>
    expect(variants[0]!.default_price).toBeCloseTo(9.99, 5)
  })
})

describe('untransformVariant (Loyverse)', () => {
  it('maps id, sku, and barcode', () => {
    const result = untransformVariant({ id: 'var_001', sku: 'WK-BLK', barcode: '012' })
    expect(result.variant_id).toBe('var_001')
    expect(result.sku).toBe('WK-BLK')
    expect(result.barcode).toBe('012')
  })

  it('converts price from minor to major units', () => {
    const result = untransformVariant({ price: { amount: 999, currency: 'USD' } })
    expect(result.default_price).toBeCloseTo(9.99, 5)
  })
})
