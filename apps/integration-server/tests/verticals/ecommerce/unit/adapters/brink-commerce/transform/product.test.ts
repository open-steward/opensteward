/**
 * transformProduct fixtures follow `ProductParent` from the ProductManagement
 * OpenAPI embedded in
 * https://docs.brinkcommerce.com/technical/api-references/management/product/product-parents.md
 * (required: created, customAttributes, description, displayDescriptions,
 * displayNames, id, isActive, isArchived, name, updated).
 */
import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformProductVariant,
  untransformProduct,
  type RawBrinkProductParent,
  type RawBrinkProductVariant,
} from '../../../../../../../src/verticals/ecommerce/adapters/brink-commerce/transform/product'
import {
  ProductSchema,
  ProductVariantSchema,
} from '../../../../../../../src/verticals/ecommerce/schema/product'

describe('transformProduct (brink-commerce)', () => {
  const raw: RawBrinkProductParent = {
    id: 'parent-abc',
    name: 'Brink Widget',
    displayNames: { en: 'Brink Widget', sv: 'Brink-pryl' },
    description: 'A great widget',
    displayDescriptions: { en: 'A great widget' },
    imageUrl: 'https://cdn.brink.com/widget.jpg',
    isActive: true,
    isArchived: false,
    customAttributes: {},
    created: '2024-03-01T00:00:00Z',
    updated: '2024-03-04T00:00:00Z',
  }

  it('parses against ProductSchema', () => {
    expect(() => ProductSchema.parse(transformProduct(raw))).not.toThrow()
  })

  it('maps id, title, description and timestamps', () => {
    expect(transformProduct(raw)).toMatchObject({
      id: 'parent-abc',
      title: 'Brink Widget',
      description: 'A great widget',
      createdAt: '2024-03-01T00:00:00.000Z',
      updatedAt: '2024-03-04T00:00:00.000Z',
    })
  })

  it('maps status from isActive / isArchived', () => {
    expect(transformProduct(raw).status).toBe('ACTIVE')
    expect(transformProduct({ ...raw, isArchived: true }).status).toBe('ARCHIVED')
    expect(transformProduct({ ...raw, isActive: false }).status).toBe('DRAFT')
  })

  it('maps imageUrl to one image with no invented id', () => {
    expect(transformProduct(raw).images).toEqual([
      { url: 'https://cdn.brink.com/widget.jpg', alt: 'Brink Widget' },
    ])
  })

  it('does not read the deprecated product-parent tags', () => {
    const out = transformProduct({ ...raw, tags: { category: ['x'] } })
    expect(out.tags).toBeUndefined()
  })

  it('returns no variants (a Brink variant has no price)', () => {
    expect(transformProduct(raw).variants).toBeUndefined()
  })

  it('handles no imageUrl — no images array', () => {
    const result = transformProduct({ ...raw, imageUrl: null })
    expect(result.images).toBeUndefined()
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})

describe('transformProductVariant (brink-commerce)', () => {
  const rawVariant: RawBrinkProductVariant = {
    id: 'var-002',
    productParentId: 'parent-abc',
    name: 'Blue',
    weight: 0.5,
  }

  it('maps id correctly', () => {
    expect(transformProductVariant(rawVariant).id).toBe('var-002')
  })

  it('maps productId from productParentId', () => {
    expect(transformProductVariant(rawVariant).productId).toBe('parent-abc')
  })

  it('sets a zero-placeholder price with currency XXX', () => {
    // Brink variant resource has no price — zero placeholder as documented
    const result = transformProductVariant(rawVariant)
    expect(result.price.amount).toBe(0)
    expect(result.price.currency).toBe('XXX')
  })

  it('maps weight', () => {
    expect(transformProductVariant(rawVariant).weight).toBe(0.5)
  })

  it('passes ProductVariantSchema validation', () => {
    expect(() => ProductVariantSchema.parse(transformProductVariant(rawVariant))).not.toThrow()
  })
})

describe('untransformProduct (brink-commerce)', () => {
  it('round-trips name and active status', () => {
    const canonical = transformProduct({
      id: 'p1',
      name: 'My Product',
      isActive: true,
    })
    const body = untransformProduct(canonical)
    expect(body.name).toBe('My Product')
    expect(body.isActive).toBe(true)
  })
})
