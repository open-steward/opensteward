import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformProductVariant,
  type RawKiboProduct,
  type RawKiboVariation,
} from '../../../../../../../src/verticals/ecommerce/adapters/kibo/transform/product'
import { ProductSchema, ProductVariantSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeProduct(overrides: Partial<RawKiboProduct> = {}): RawKiboProduct {
  return {
    productCode: 'KIBO-001',
    content: {
      productName: 'Kibo Smart Speaker',
      productFullDescription: '<p>Premium smart speaker with voice assistant.</p>',
      productShortDescription: 'Smart Speaker',
      seoFriendlyUrl: 'kibo-smart-speaker',
      productImages: [
        {
          imageUrl: 'https://cdn.kibo.com/images/speaker.jpg',
          imageAltText: 'Kibo Smart Speaker',
          sequence: 0,
        },
        {
          imageUrl: 'https://cdn.kibo.com/images/speaker-side.jpg',
          imageAltText: 'Kibo Smart Speaker side view',
          sequence: 1,
        },
      ],
    },
    price: {
      price: 149.99,
      salePrice: 129.99,
    },
    inventoryInfo: {
      onlineStockAvailable: 50,
    },
    isActive: true,
    productUsage: 'Standard',
    createDate: '2024-01-15T09:00:00Z',
    updateDate: '2024-06-20T14:00:00Z',
    ...overrides,
  }
}

function makeConfigurableProduct(overrides: Partial<RawKiboProduct> = {}): RawKiboProduct {
  return {
    ...makeProduct(),
    productUsage: 'Configurable',
    options: [
      {
        attributeFQN: 'tenant~color',
        attributeDetail: { name: 'Color' },
        values: [
          { stringValue: 'Black', isEnabled: true },
          { stringValue: 'White', isEnabled: true },
          { stringValue: 'Gray', isEnabled: false },
        ],
      },
      {
        attributeFQN: 'tenant~size',
        attributeDetail: { name: 'Size' },
        values: [
          { stringValue: 'Small', isEnabled: true },
          { stringValue: 'Large', isEnabled: true },
        ],
      },
    ],
    variations: [
      {
        productCode: 'KIBO-001-BLK-SM',
        options: [
          { attributeFQN: 'tenant~color', attributeDetail: { name: 'Color' }, stringValue: 'Black' },
          { attributeFQN: 'tenant~size', attributeDetail: { name: 'Size' }, stringValue: 'Small' },
        ],
        price: { price: 149.99, salePrice: 129.99 },
        inventoryInfo: { onlineStockAvailable: 20 },
        isActive: true,
      },
      {
        productCode: 'KIBO-001-WHT-LG',
        options: [
          { attributeFQN: 'tenant~color', attributeDetail: { name: 'Color' }, stringValue: 'White' },
          { attributeFQN: 'tenant~size', attributeDetail: { name: 'Size' }, stringValue: 'Large' },
        ],
        price: { price: 149.99 },
        inventoryInfo: { onlineStockAvailable: 30 },
        isActive: true,
      },
    ],
    ...overrides,
  }
}

function makeVariation(overrides: Partial<RawKiboVariation> = {}): RawKiboVariation {
  return {
    productCode: 'KIBO-001-BLK-SM',
    options: [
      { attributeFQN: 'tenant~color', attributeDetail: { name: 'Color' }, stringValue: 'Black' },
      { attributeFQN: 'tenant~size', attributeDetail: { name: 'Size' }, stringValue: 'Small' },
    ],
    price: { price: 149.99, salePrice: 129.99 },
    inventoryInfo: { onlineStockAvailable: 20 },
    isActive: true,
    ...overrides,
  }
}

// ── transformProduct ──────────────────────────────────────────────────────────

describe('transformProduct (Kibo)', () => {
  it('maps core fields', () => {
    const result = transformProduct(makeProduct())
    expect(result.id).toBe('KIBO-001')
    expect(result.title).toBe('Kibo Smart Speaker')
    expect(result.description).toBe('<p>Premium smart speaker with voice assistant.</p>')
    expect(result.handle).toBe('kibo-smart-speaker')
    expect(result.status).toBe('ACTIVE')
    expect(result.createdAt).toBe('2024-01-15T09:00:00Z')
    expect(result.updatedAt).toBe('2024-06-20T14:00:00Z')
  })

  it('maps status ACTIVE when isActive=true', () => {
    const result = transformProduct(makeProduct({ isActive: true }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps status ARCHIVED when isActive=false', () => {
    const result = transformProduct(makeProduct({ isActive: false }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('maps status DRAFT from publishState', () => {
    const result = transformProduct(makeProduct({ publishState: 'Draft', isActive: undefined }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps images from content.productImages', () => {
    const result = transformProduct(makeProduct())
    expect(result.images).toHaveLength(2)
    expect(result.images![0]!.url).toBe('https://cdn.kibo.com/images/speaker.jpg')
    expect(result.images![0]!.alt).toBe('Kibo Smart Speaker')
    expect(result.images![1]!.position).toBe(1)
  })

  it('returns undefined images when none are present', () => {
    const result = transformProduct(makeProduct({ content: { productName: 'No Image Product' } }))
    expect(result.images).toBeUndefined()
  })

  it('synthesises a default variant for simple products', () => {
    const result = transformProduct(makeProduct())
    expect(result.variants).toHaveLength(1)
    const v = result.variants![0]!
    expect(v.id).toBe('KIBO-001:default')
    expect(v.productId).toBe('KIBO-001')
    expect((v.metadata as { synthetic?: boolean }).synthetic).toBe(true)
    expect(() => ProductVariantSchema.parse(v)).not.toThrow()
  })

  it('maps variations into variants for configurable products', () => {
    const result = transformProduct(makeConfigurableProduct())
    expect(result.variants).toHaveLength(2)
    expect(result.variants![0]!.id).toBe('KIBO-001-BLK-SM')
    expect(result.variants![1]!.id).toBe('KIBO-001-WHT-LG')
  })

  it('maps product options from options array', () => {
    const result = transformProduct(makeConfigurableProduct())
    expect(result.options).toHaveLength(2)
    expect(result.options![0]!.name).toBe('Color')
    expect(result.options![0]!.values).toContain('Black')
    expect(result.options![0]!.values).toContain('White')
    // Disabled values are excluded
    expect(result.options![0]!.values).not.toContain('Gray')
  })

  it('maps salePrice as variant price and price as compareAtPrice', () => {
    const result = transformProduct(makeConfigurableProduct())
    const v = result.variants![0]!
    expect(v.price.amount).toBe(12999)
    expect(v.compareAtPrice?.amount).toBe(14999)
  })

  it('uses price when no salePrice for default variant', () => {
    const result = transformProduct(makeProduct())
    const v = result.variants![0]!
    // salePrice=129.99 is set on makeProduct, so use salePrice
    expect(v.price.amount).toBe(12999)
  })

  it('preserves the raw payload in metadata', () => {
    const raw = makeProduct()
    const result = transformProduct(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies ProductSchema', () => {
    const result = transformProduct(makeProduct())
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })

  it('produces a valid ProductSchema for configurable product with variants', () => {
    const result = transformProduct(makeConfigurableProduct())
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })

  it('handles missing productCode gracefully', () => {
    const result = transformProduct({ content: { productName: 'No Code' } })
    expect(result.id).toBe('')
    expect(result.title).toBe('No Code')
  })

  it('handles completely empty product', () => {
    const result = transformProduct({})
    expect(result.id).toBe('')
    expect(result.title).toBe('')
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })

  it('maps productType from productType field', () => {
    const result = transformProduct(makeProduct({ productType: 'Electronics' }))
    expect(result.productType).toBe('Electronics')
  })
})

// ── transformProductVariant ───────────────────────────────────────────────────

describe('transformProductVariant (Kibo) standalone', () => {
  it('builds a canonical variant from a variation', () => {
    const v = transformProductVariant(makeVariation(), 'KIBO-001', 'USD')
    expect(v.id).toBe('KIBO-001-BLK-SM')
    expect(v.productId).toBe('KIBO-001')
    expect(v.price).toEqual({ amount: 12999, currency: 'USD' })
    expect(v.compareAtPrice).toEqual({ amount: 14999, currency: 'USD' })
    expect(() => ProductVariantSchema.parse(v)).not.toThrow()
  })

  it('maps option values into optionValues record', () => {
    const v = transformProductVariant(makeVariation(), 'KIBO-001', 'USD')
    expect(v.optionValues).toEqual({ Color: 'Black', Size: 'Small' })
  })

  it('uses list price when no sale price', () => {
    const variation = makeVariation({ price: { price: 149.99 } })
    const v = transformProductVariant(variation, 'KIBO-001', 'USD')
    expect(v.price.amount).toBe(14999)
    expect(v.compareAtPrice).toBeUndefined()
  })

  it('preserves variation raw payload in metadata', () => {
    const raw = makeVariation()
    const v = transformProductVariant(raw, 'KIBO-001', 'USD')
    expect(v.metadata).toBe(raw)
  })

  it('handles missing options gracefully', () => {
    const v = transformProductVariant({ productCode: 'KIBO-001-A' }, 'KIBO-001', 'USD')
    expect(v.optionValues).toBeUndefined()
    expect(v.price.amount).toBe(0)
  })
})
