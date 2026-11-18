/**
 * Toast Configuration API MenuItem → Product.
 *
 * The fixture carries only fields of the documented `MenuItem` schema
 * (https://doc.toasttab.com/openapi/configuration/operation/menuItemsGet/):
 * `guid`, `entityType`, `externalId`, `name`, `calories`, `sku`, `plu`,
 * `orderableOnline`, `visibility`, `type`, `optionGroups`,
 * `inheritOptionGroups`, `images`, `unitOfMeasure`, `inheritUnitOfMeasure`.
 * The spec publishes no example response.
 */
import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  untransformProduct,
  toastPriceToDollars,
  type RawToastMenuItem,
} from '../../../../../../../src/verticals/ecommerce/adapters/toast/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeMenuItem(overrides: Partial<RawToastMenuItem> = {}): RawToastMenuItem {
  return {
    guid: '88aebc5f-4635-4141-9c0f-5a9be6324218',
    entityType: 'MenuItem',
    externalId: 'pos:1234',
    name: 'Margherita Pizza',
    calories: 850,
    sku: 'PIZZA-MARG',
    plu: '4011',
    orderableOnline: 'YES',
    visibility: 'ALL',
    type: 'NONE',
    optionGroups: [{ guid: 'og-1', entityType: 'MenuOptionGroup' }],
    inheritOptionGroups: true,
    images: [{ url: 'https://cdn.example.com/margherita.jpg' }],
    unitOfMeasure: 'NONE',
    inheritUnitOfMeasure: false,
    ...overrides,
  }
}

describe('transformProduct (Toast)', () => {
  it('maps the documented fields and parses as a Product', () => {
    const raw = makeMenuItem()
    const result = ProductSchema.parse(transformProduct(raw))
    expect(result.id).toBe('88aebc5f-4635-4141-9c0f-5a9be6324218')
    expect(result.title).toBe('Margherita Pizza')
    expect(result.status).toBe('ACTIVE')
    expect(result.images).toEqual([{ url: 'https://cdn.example.com/margherita.jpg', position: 0 }])
    expect(result.metadata).toEqual(raw)
  })

  it('invents no variant, price, currency, description, handle or dates', () => {
    const result = ProductSchema.parse(transformProduct(makeMenuItem()))
    expect(result.variants).toBeUndefined()
    expect(result.description).toBeUndefined()
    expect(result.handle).toBeUndefined()
    expect(result.productType).toBeUndefined()
    expect(result.tags).toBeUndefined()
    expect(result.createdAt).toBeUndefined()
    expect(result.updatedAt).toBeUndefined()
  })

  it('maps visibility NONE to ARCHIVED, POS_ONLY to ACTIVE, and leaves an absent one unset', () => {
    expect(transformProduct(makeMenuItem({ visibility: 'NONE' })).status).toBe('ARCHIVED')
    expect(transformProduct(makeMenuItem({ visibility: 'POS_ONLY' })).status).toBe('ACTIVE')
    const bare = ProductSchema.parse(transformProduct(makeMenuItem({ visibility: undefined })))
    expect(bare.status).toBeUndefined()
  })

  it('drops images without a url', () => {
    const result = transformProduct(
      makeMenuItem({ images: [{}, { url: 'https://x.example/a.png' }] }),
    )
    expect(result.images).toEqual([{ url: 'https://x.example/a.png', position: 0 }])
    expect(transformProduct(makeMenuItem({ images: [] })).images).toBeUndefined()
  })

  it('throws rather than inventing a title when name is absent', () => {
    expect(() => transformProduct(makeMenuItem({ name: undefined }))).toThrow(/no name/)
  })

  it('untransformProduct sets NONE visibility for ARCHIVED status', () => {
    const raw = untransformProduct({ status: 'ARCHIVED', title: 'Test' })
    expect(raw['visibility']).toBe('NONE')
    expect(raw['name']).toBe('Test')
  })
})

describe('toastPriceToDollars (discount transform helper)', () => {
  it('converts decimal major units to minor units', () => {
    expect(toastPriceToDollars(14.99)).toBe(1499)
  })
})
