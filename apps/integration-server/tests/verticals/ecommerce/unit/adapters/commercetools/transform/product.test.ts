import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  untransformProduct,
  buildActionsForProduct,
  type RawCtProduct,
  type RawCtProductProjection,
} from '../../../../../../../src/verticals/ecommerce/adapters/commercetools/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeProjection(
  overrides: Partial<RawCtProductProjection> = {},
): RawCtProductProjection {
  return {
    id: 'prod-abc',
    version: 3,
    key: 'coffee',
    name: { 'en-US': 'Cold Brew Coffee', 'de-DE': 'Cold Brew Kaffee' },
    description: { 'en-US': 'Smooth and strong.', 'de-DE': 'Weich und stark.' },
    slug: { 'en-US': 'cold-brew-coffee' },
    masterVariant: {
      id: 1,
      sku: 'CB-250',
      prices: [
        {
          value: { type: 'centPrecision', centAmount: 1999, currencyCode: 'USD', fractionDigits: 2 },
        },
      ],
      images: [{ url: 'https://cdn.ct.example/cb.jpg', label: 'front', dimensions: { w: 800, h: 600 } }],
      attributes: [
        { name: 'size', value: '250ml' },
        { name: 'roast', value: { 'en-US': 'Dark' } },
      ],
    },
    variants: [
      {
        id: 2,
        sku: 'CB-500',
        prices: [
          {
            value: { type: 'centPrecision', centAmount: 2999, currencyCode: 'USD', fractionDigits: 2 },
          },
        ],
        attributes: [
          { name: 'size', value: '500ml' },
          { name: 'roast', value: { 'en-US': 'Dark' } },
        ],
      },
    ],
    productType: { id: 'pt-drink', typeId: 'product-type' },
    categories: [{ id: 'cat-beverage', typeId: 'category' }],
    published: true,
    createdAt: '2024-01-01T00:00:00Z',
    lastModifiedAt: '2024-02-01T00:00:00Z',
    ...overrides,
  }
}

function makeProduct(): RawCtProduct {
  const current = makeProjection()
  return {
    id: current.id,
    version: 3,
    productType: current.productType,
    masterData: {
      current,
      staged: current,
      published: true,
      hasStagedChanges: false,
    },
    createdAt: '2024-01-01T00:00:00Z',
    lastModifiedAt: '2024-02-01T00:00:00Z',
  }
}

describe('transformProduct (commercetools)', () => {
  it('flattens localized strings using the primary locale', () => {
    const result = transformProduct(makeProjection())
    expect(result.title).toBe('Cold Brew Coffee')
    expect(result.description).toBe('Smooth and strong.')
    expect(result.handle).toBe('cold-brew-coffee')
  })

  it('preserves the full locale map under metadata.localizedStrings', () => {
    const result = transformProduct(makeProjection())
    const ls = (result.metadata['localizedStrings'] as Record<string, Record<string, string>>)
    expect(ls.name!['de-DE']).toBe('Cold Brew Kaffee')
  })

  it('maps master + additional variants with position and money', () => {
    const result = transformProduct(makeProjection())
    expect(result.variants).toHaveLength(2)
    expect(result.variants![0]!.position).toBe(1)
    expect(result.variants![0]!.price).toEqual({ amount: 1999, currency: 'USD' })
    expect(result.variants![1]!.position).toBe(2)
    expect(result.variants![1]!.sku).toBe('CB-500')
  })

  it('unwraps Product (authoring model) the same way as ProductProjection', () => {
    const result = transformProduct(makeProduct())
    expect(result.id).toBe('prod-abc')
    expect(result.title).toBe('Cold Brew Coffee')
    expect(result.status).toBe('ACTIVE')
  })

  it('produces a payload that satisfies ProductSchema', () => {
    const result = transformProduct(makeProjection())
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })

  it('round-trips writable fields via untransformProduct', () => {
    const canonical = transformProduct(makeProjection())
    const raw = untransformProduct(canonical) as Record<string, Record<string, string> | undefined>
    expect(raw['name']!['en-US']).toBe('Cold Brew Coffee')
    expect(raw['slug']!['en-US']).toBe('cold-brew-coffee')
    expect(raw['description']!['en-US']).toBe('Smooth and strong.')
  })

  it('builds update actions from a partial patch', () => {
    const actions = buildActionsForProduct(makeProjection(), {
      title: 'Nitro Cold Brew',
      description: 'Now with N2.',
      status: 'ACTIVE',
    })
    const names = actions.map((a) => a['action'])
    expect(names).toContain('changeName')
    expect(names).toContain('setDescription')
    expect(names).toContain('publish')
    const change = actions.find((a) => a['action'] === 'changeName')!
    expect((change['name'] as Record<string, string>)['en-US']).toBe('Nitro Cold Brew')
  })
})
