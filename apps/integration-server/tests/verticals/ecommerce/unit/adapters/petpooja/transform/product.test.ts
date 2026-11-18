import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformVariant,
  untransformProduct,
  type RawPetpoojaItem,
  type RawPetpoojaVariant,
} from '../../../../../../../src/verticals/ecommerce/adapters/petpooja/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeItem(overrides: Partial<RawPetpoojaItem> = {}): RawPetpoojaItem {
  return {
    itemid: 301,
    itemname: 'Paneer Tikka',
    item_categoryid: 101,
    item_description: 'Grilled paneer cubes with spices',
    item_image_url: 'https://cdn.petpooja.com/img/paneer-tikka.jpg',
    item_type: 1, // veg
    active: 1,
    price: '149.00',
    item_variants: [
      { id: 501, name: 'Half', price: '99.00' },
      { id: 502, name: 'Full', price: '149.00' },
    ],
    ...overrides,
  }
}

describe('petpooja transformProduct', () => {
  it('maps core fields and stringifies itemid', () => {
    const result = transformProduct(makeItem())
    expect(result.id).toBe('301')
    expect(result.title).toBe('Paneer Tikka')
    expect(result.description).toBe('Grilled paneer cubes with spices')
    expect(result.status).toBe('ACTIVE')
  })

  it('maps item_type 1 to productType "veg"', () => {
    const result = transformProduct(makeItem())
    expect(result.productType).toBe('veg')
  })

  it('maps item_type 2 to productType "non-veg"', () => {
    const result = transformProduct(makeItem({ item_type: 2 }))
    expect(result.productType).toBe('non-veg')
  })

  it('maps active=0 to ARCHIVED status', () => {
    const result = transformProduct(makeItem({ active: 0 }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('transforms variants with INR minor-unit prices', () => {
    const result = transformProduct(makeItem())
    expect(result.variants).toHaveLength(2)
    const half = result.variants![0]!
    expect(half.id).toBe('501')
    expect(half.title).toBe('Half')
    // 99.00 INR = 9900 paise
    expect(half.price).toEqual({ amount: 9900, currency: 'INR' })
    expect(half.productId).toBe('301')
  })

  it('maps image url', () => {
    const result = transformProduct(makeItem())
    expect(result.images).toHaveLength(1)
    expect(result.images![0]!.url).toBe('https://cdn.petpooja.com/img/paneer-tikka.jpg')
  })

  it('omits variants when none provided', () => {
    const result = transformProduct(makeItem({ item_variants: [] }))
    expect(result.variants).toBeUndefined()
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeItem()
    const result = transformProduct(raw)
    expect((result.metadata as { item_category_id: unknown }).item_category_id).toBe(101)
  })

  it('produces a payload that satisfies ProductSchema', () => {
    const result = transformProduct(makeItem())
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformProduct', () => {
    const canonical = transformProduct(makeItem())
    const raw = untransformProduct(canonical)
    expect(raw.itemname).toBe('Paneer Tikka')
    expect(raw.active).toBe(1)
    expect(raw.item_image_url).toBe('https://cdn.petpooja.com/img/paneer-tikka.jpg')
  })
})

describe('petpooja transformVariant', () => {
  it('maps variant fields with INR pricing', () => {
    const rawVariant: RawPetpoojaVariant = { id: 501, name: 'Half', price: '99.00' }
    const result = transformVariant(rawVariant, 301)
    expect(result.id).toBe('501')
    expect(result.productId).toBe('301')
    expect(result.title).toBe('Half')
    expect(result.price).toEqual({ amount: 9900, currency: 'INR' })
  })
})
