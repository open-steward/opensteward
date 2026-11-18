/**
 * FastSpring Product transform tests.
 *
 * Raw shape per https://developer.fastspring.com/reference/retrieve-a-product
 * and https://developer.fastspring.com/reference/create-or-update-products.
 */
import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  untransformProduct,
  type RawFastSpringProduct,
} from '../../../../../../../src/verticals/ecommerce/adapters/fastspring/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeProduct(overrides: Partial<RawFastSpringProduct> = {}): RawFastSpringProduct {
  return {
    product: 'premium-laptop',
    display: { en: 'FastSpring Falcon' },
    description: { summary: { en: 'The original FastSpring Falcon' } },
    image: 'https://image.com/furious-falcon-logo.png',
    sku: 'sku-12345',
    visibility: 'public',
    pricing: { price: { USD: 444.99, EUR: 899.99 } },
    ...overrides,
  }
}

describe('FastSpring transform/product', () => {
  it('maps a full product and survives ProductSchema.parse', () => {
    const product = transformProduct(makeProduct())
    expect(ProductSchema.parse(product)).toBeTruthy()
    expect(product.id).toBe('premium-laptop')
    expect(product.title).toBe('FastSpring Falcon')
    expect(product.handle).toBe('premium-laptop')
    expect(product.status).toBe('ACTIVE')
    expect(product.images).toEqual([{ url: 'https://image.com/furious-falcon-logo.png' }])
  })

  it('converts decimal USD pricing to integer minor units on a synthetic variant', () => {
    const product = transformProduct(makeProduct())
    ProductSchema.parse(product)
    expect(product.variants).toHaveLength(1)
    expect(product.variants![0]!.price).toEqual({ amount: 44499, currency: 'USD' })
    expect(product.variants![0]!.sku).toBe('sku-12345')
  })

  it('prefers USD when multiple currencies are priced', () => {
    const product = transformProduct(makeProduct({ pricing: { price: { EUR: 10, USD: 20 } } }))
    expect(product.variants![0]!.price.currency).toBe('USD')
  })

  it('falls back to the only currency present when USD is absent', () => {
    const product = transformProduct(makeProduct({ pricing: { price: { GBP: 15.5 } } }))
    ProductSchema.parse(product)
    expect(product.variants![0]!.price).toEqual({ amount: 1550, currency: 'GBP' })
  })

  it('maps a non-public visibility to DRAFT', () => {
    const product = transformProduct(makeProduct({ visibility: 'test' }))
    expect(product.status).toBe('DRAFT')
  })

  it('leaves status undefined when visibility is absent', () => {
    const product = transformProduct(makeProduct({ visibility: undefined }))
    ProductSchema.parse(product)
    expect(product.status).toBeUndefined()
  })

  it('omits variants entirely when no price is reported', () => {
    const product = transformProduct(makeProduct({ pricing: undefined }))
    expect(ProductSchema.parse(product)).toBeTruthy()
    expect(product.variants).toBeUndefined()
  })

  it('preserves the complete raw payload in metadata', () => {
    const raw = makeProduct()
    const product = transformProduct(raw)
    expect(product.metadata).toEqual(raw)
  })

  it('untransformProduct builds a create/update body FastSpring accepts', () => {
    const product = transformProduct(makeProduct())
    const body = untransformProduct(product)
    expect(body).toMatchObject({
      product: 'premium-laptop',
      display: { en: 'FastSpring Falcon' },
      sku: 'sku-12345',
      pricing: { price: { USD: 444.99 } },
    })
  })
})
