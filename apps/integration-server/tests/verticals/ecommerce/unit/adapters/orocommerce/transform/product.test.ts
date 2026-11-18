import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformProductVariant,
  untransformProduct,
  type RawOroProduct,
} from '../../../../../../../src/verticals/ecommerce/adapters/orocommerce/transform/product'
import { ProductSchema, ProductVariantSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeConfigurable(overrides: Partial<RawOroProduct> = {}): RawOroProduct {
  return {
    id: '42',
    sku: 'PUMP-3000',
    name: 'Industrial Pump 3000',
    status: 'enabled',
    type: 'configurable',
    description: '<p>Heavy-duty pump for B2B applications.</p>',
    url: 'industrial-pump-3000',
    createdAt: '2024-03-15T10:00:00.000Z',
    updatedAt: '2024-04-01T14:30:00.000Z',
    prices: [{ price: 1299.99, currency: 'EUR', quantity: 1, unit: 'item' }],
    images: [
      { id: '901', url: '/media/pump-front.jpg', types: ['main'] },
      { id: '902', url: '/media/pump-side.jpg', types: ['listing'] },
    ],
    productAttributes: {
      material: ['Steel', 'Titanium'],
      size: ['Small', 'Large'],
    },
    _type: 'products',
    _relationships: {
      variantProducts: {
        data: [{ type: 'products', id: '43' }, { type: 'products', id: '44' }],
      },
    },
    ...overrides,
  }
}

function makeChild(overrides: Partial<RawOroProduct> = {}): RawOroProduct {
  return {
    id: '43',
    sku: 'PUMP-3000-STEEL-SM',
    name: 'Industrial Pump 3000 - Steel / Small',
    status: 'enabled',
    type: 'simple',
    prices: [{ price: 1299.99, currency: 'EUR', quantity: 1, unit: 'item' }],
    _type: 'products',
    ...overrides,
  }
}

describe('transformProduct (OroCommerce)', () => {
  it('maps core fields for a configurable parent', () => {
    const result = transformProduct(makeConfigurable())
    expect(result.id).toBe('42')
    expect(result.title).toBe('Industrial Pump 3000')
    expect(result.description).toBe('<p>Heavy-duty pump for B2B applications.</p>')
    expect(result.handle).toBe('industrial-pump-3000')
    expect(result.status).toBe('ACTIVE')
    expect(result.productType).toBe('configurable')
  })

  it('maps children into variants', () => {
    const parent = makeConfigurable()
    const child = makeChild()
    const result = transformProduct(parent, [child])
    expect(result.variants).toHaveLength(1)
    const v = result.variants![0]!
    expect(v.id).toBe('43')
    expect(v.productId).toBe('42')
    expect(v.sku).toBe('PUMP-3000-STEEL-SM')
    expect(v.price).toEqual({ amount: 129999, currency: 'EUR' })
  })

  it('synthesises a default variant for simple products', () => {
    const simple = makeConfigurable({
      id: '99',
      type: 'simple',
      sku: 'BOLT-7',
      prices: [{ price: 0.50, currency: 'USD' }],
    })
    const result = transformProduct(simple)
    expect(result.variants).toHaveLength(1)
    const v = result.variants![0]!
    expect(v.id).toBe('99:default')
    expect(v.sku).toBe('BOLT-7')
    expect((v.metadata as { synthetic?: boolean }).synthetic).toBe(true)
    expect(() => ProductVariantSchema.parse(v)).not.toThrow()
  })

  it('builds options from productAttributes', () => {
    const result = transformProduct(makeConfigurable())
    expect(result.options).toHaveLength(2)
    expect(result.options![0]!.name).toBe('material')
    expect(result.options![0]!.values).toEqual(['Steel', 'Titanium'])
  })

  it('preserves the raw payload in metadata', () => {
    const raw = makeConfigurable()
    const result = transformProduct(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies ProductSchema', () => {
    const result = transformProduct(makeConfigurable(), [makeChild()])
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})

describe('transformProductVariant (OroCommerce) standalone', () => {
  it('builds a canonical variant from a child product', () => {
    const v = transformProductVariant(makeChild(), '42')
    expect(v.id).toBe('43')
    expect(v.productId).toBe('42')
    expect(v.sku).toBe('PUMP-3000-STEEL-SM')
    expect(v.price).toEqual({ amount: 129999, currency: 'EUR' })
    expect(v.taxable).toBe(true)
    expect(() => ProductVariantSchema.parse(v)).not.toThrow()
  })
})

describe('untransformProduct (OroCommerce)', () => {
  it('round-trips writable fields', () => {
    const canonical = transformProduct(makeConfigurable({ type: 'simple' }))
    const body = untransformProduct(canonical) as { data: { type: string; attributes: Record<string, unknown> } }
    expect(body.data.type).toBe('products')
    expect(body.data.attributes['name']).toBe('Industrial Pump 3000')
    expect(body.data.attributes['status']).toBe('enabled')
  })
})
