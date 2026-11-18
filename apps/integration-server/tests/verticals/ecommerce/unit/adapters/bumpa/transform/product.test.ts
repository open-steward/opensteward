import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformVariant,
  untransformProduct,
  type RawBumpaProduct,
  type RawBumpaVariant,
} from '../../../../../../../src/verticals/ecommerce/adapters/bumpa/transform/product'
import {
  ProductSchema,
  ProductVariantSchema,
} from '../../../../../../../src/verticals/ecommerce/schema/product'

describe('transformProduct (bumpa)', () => {
  const raw: RawBumpaProduct = {
    id: 600,
    name: 'Adire Fabric',
    description: 'Hand-dyed Yoruba fabric',
    slug: 'adire-fabric',
    product_type: 'Textile',
    status: 'active',
    currency: 'NGN',
    tags: 'fashion,local',
    images: [{ id: 10, url: 'https://bumpa.ng/adire.jpg', position: 1 }],
    product_variants: [
      {
        id: 601,
        product_id: 600,
        name: 'Blue',
        price: '8000.00',
        compare_price: '10000.00',
        sku: 'ADR-BLUE',
        weight: 0.5,
      },
    ],
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
    published_at: '2024-03-01T00:00:00Z',
  }

  it('maps id to string', () => {
    expect(transformProduct(raw).id).toBe('600')
  })

  it('maps title from name', () => {
    expect(transformProduct(raw).title).toBe('Adire Fabric')
  })

  it('maps handle from slug', () => {
    expect(transformProduct(raw).handle).toBe('adire-fabric')
  })

  it('maps status to ACTIVE', () => {
    expect(transformProduct(raw).status).toBe('ACTIVE')
  })

  it('maps status published → ACTIVE', () => {
    expect(transformProduct({ ...raw, status: 'published' }).status).toBe('ACTIVE')
  })

  it('maps status draft → DRAFT', () => {
    expect(transformProduct({ ...raw, status: 'draft' }).status).toBe('DRAFT')
  })

  it('maps tags from comma-separated string', () => {
    expect(transformProduct(raw).tags).toEqual(['fashion', 'local'])
  })

  it('maps images with url', () => {
    const result = transformProduct(raw)
    expect(result.images![0]!.url).toBe('https://bumpa.ng/adire.jpg')
  })

  it('maps variants with price in minor units', () => {
    const result = transformProduct(raw)
    expect(result.variants![0]!.id).toBe('601')
    // 8000.00 NGN → 800000 kobo
    expect(result.variants![0]!.price.amount).toBe(800000)
    expect(result.variants![0]!.price.currency).toBe('NGN')
  })

  it('maps compareAtPrice in minor units', () => {
    // 10000.00 NGN → 1000000 kobo
    expect(transformProduct(raw).variants![0]!.compareAtPrice?.amount).toBe(1000000)
  })

  it('synthesizes a default variant when no variants present', () => {
    const noVariants: RawBumpaProduct = {
      ...raw,
      product_variants: [],
      price: '5000.00',
      sku: 'DEFAULT-SKU',
    }
    const result = transformProduct(noVariants)
    expect(result.variants).toHaveLength(1)
    expect(result.variants![0]!.id).toBe('600')
    // 5000.00 NGN → 500000 kobo
    expect(result.variants![0]!.price.amount).toBe(500000)
  })

  it('passes ProductSchema validation', () => {
    expect(() => ProductSchema.parse(transformProduct(raw))).not.toThrow()
  })
})

describe('transformVariant (bumpa)', () => {
  const rawVariant: RawBumpaVariant = {
    id: 700,
    product_id: 600,
    name: 'Green',
    price: '3500.00',
    sku: 'GRN-01',
    weight: 0.3,
  }

  it('maps variant id to string', () => {
    expect(transformVariant(rawVariant).id).toBe('700')
  })

  it('maps price to minor units', () => {
    // 3500.00 NGN → 350000 kobo
    expect(transformVariant(rawVariant, 'NGN').price.amount).toBe(350000)
  })

  it('maps sku', () => {
    expect(transformVariant(rawVariant).sku).toBe('GRN-01')
  })

  it('passes ProductVariantSchema validation', () => {
    expect(() => ProductVariantSchema.parse(transformVariant(rawVariant))).not.toThrow()
  })
})

describe('untransformProduct (bumpa)', () => {
  it('round-trips name and slug', () => {
    const canonical = transformProduct({
      id: 1,
      name: 'Test',
      slug: 'test',
      status: 'active',
      currency: 'NGN',
    })
    const body = untransformProduct(canonical)
    expect(body.name).toBe('Test')
    expect(body.slug).toBe('test')
  })
})
