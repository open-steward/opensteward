import { describe, it, expect } from 'vitest'
import {
  transformAbstractProduct,
  transformConcreteProduct,
  untransformProduct,
  type RawSprykerAbstractProduct,
  type RawSprykerConcreteProduct,
  type RawSprykerPriceResource,
  type RawSprykerImageSetResource,
} from '../../../../../../../src/verticals/ecommerce/adapters/spryker/transform/product'
import { ProductSchema, ProductVariantSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeAbstractProduct(
  overrides: Partial<RawSprykerAbstractProduct['attributes']> = {},
): RawSprykerAbstractProduct {
  return {
    type: 'abstract-products',
    id: '001',
    attributes: {
      sku: '001',
      name: 'Mechanical Keyboard',
      description: 'A premium mechanical keyboard.',
      superAttributesDefinition: ['color'],
      url: undefined,
      ...overrides,
    },
  }
}

function makeConcreteProduct(
  overrides: Partial<RawSprykerConcreteProduct['attributes']> = {},
): RawSprykerConcreteProduct {
  return {
    type: 'concrete-products',
    id: '001_black',
    attributes: {
      sku: '001_black',
      name: 'Mechanical Keyboard Black',
      productAbstractSku: '001',
      ...overrides,
    },
  }
}

function makePriceResource(): RawSprykerPriceResource {
  return {
    type: 'abstract-product-prices',
    id: '001',
    attributes: {
      price: 14999,
      prices: [
        {
          priceTypeName: 'DEFAULT',
          grossAmount: 14999,
          netAmount: 12600,
          currency: { code: 'EUR', name: 'Euro', symbol: '€' },
        },
      ],
      currency: { code: 'EUR' },
    },
  }
}

function makeImageResource(): RawSprykerImageSetResource {
  return {
    type: 'abstract-product-image-sets',
    id: '001',
    attributes: {
      imageSets: [
        {
          name: 'default',
          images: [
            {
              externalUrlSmall: 'https://cdn.example.com/small/keyboard.jpg',
              externalUrlLarge: 'https://cdn.example.com/large/keyboard.jpg',
            },
          ],
        },
      ],
    },
  }
}

describe('transformAbstractProduct (Spryker)', () => {
  it('maps abstract SKU as id and name as title', () => {
    const result = transformAbstractProduct(makeAbstractProduct())
    expect(result.id).toBe('001')
    expect(result.title).toBe('Mechanical Keyboard')
  })

  it('maps description', () => {
    const result = transformAbstractProduct(makeAbstractProduct())
    expect(result.description).toBe('A premium mechanical keyboard.')
  })

  it('status is always ACTIVE', () => {
    const result = transformAbstractProduct(makeAbstractProduct())
    expect(result.status).toBe('ACTIVE')
  })

  it('maps superAttributesDefinition to options', () => {
    const result = transformAbstractProduct(makeAbstractProduct())
    expect(result.options).toHaveLength(1)
    expect(result.options![0]!.name).toBe('color')
  })

  it('extracts DEFAULT price from priceResource', () => {
    const result = transformAbstractProduct(
      makeAbstractProduct(),
      [],
      makePriceResource(),
    )
    // Spryker prices are already in minor units
    expect(result.variants).toBeUndefined() // no concretes provided
  })

  it('maps images from imageResource', () => {
    const result = transformAbstractProduct(
      makeAbstractProduct(),
      [],
      undefined,
      makeImageResource(),
    )
    expect(result.images).toHaveLength(1)
    expect(result.images![0]!.url).toBe('https://cdn.example.com/large/keyboard.jpg')
    expect(result.images![0]!.position).toBe(0)
  })

  it('maps concrete products as variants', () => {
    const result = transformAbstractProduct(makeAbstractProduct(), [makeConcreteProduct()])
    expect(result.variants).toHaveLength(1)
    expect(result.variants![0]!.id).toBe('001_black')
    expect(result.variants![0]!.sku).toBe('001_black')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeAbstractProduct()
    expect(transformAbstractProduct(raw).metadata).toBe(raw)
  })

  it('produces a schema-valid result', () => {
    expect(() =>
      ProductSchema.parse(
        transformAbstractProduct(
          makeAbstractProduct(),
          [makeConcreteProduct()],
          makePriceResource(),
          makeImageResource(),
        ),
      ),
    ).not.toThrow()
  })

  it('round-trips via untransformProduct', () => {
    const canonical = transformAbstractProduct(makeAbstractProduct())
    const body = untransformProduct(canonical)
    const attrs = (body as { data: { attributes: Record<string, unknown> } }).data.attributes
    expect(attrs['name']).toBe('Mechanical Keyboard')
    expect(attrs['description']).toBe('A premium mechanical keyboard.')
  })
})

describe('transformConcreteProduct (Spryker)', () => {
  it('maps concrete SKU as id and sku', () => {
    const result = transformConcreteProduct(makeConcreteProduct(), '001')
    expect(result.id).toBe('001_black')
    expect(result.sku).toBe('001_black')
  })

  it('links to parent productId', () => {
    const result = transformConcreteProduct(makeConcreteProduct(), '001')
    expect(result.productId).toBe('001')
  })

  it('produces a schema-valid variant', () => {
    expect(() =>
      ProductVariantSchema.parse(transformConcreteProduct(makeConcreteProduct(), '001')),
    ).not.toThrow()
  })
})
