import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformVariant,
} from '../../../../../../../src/verticals/ecommerce/adapters/sana-commerce/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

describe('transformProduct', () => {
  it('maps Id and Title (PascalCase) to id and title', () => {
    const result = transformProduct({ Id: 42, Title: 'Widget Pro' })
    expect(result.id).toBe('42')
    expect(result.title).toBe('Widget Pro')
  })

  it('maps id and title (camelCase) to id and title', () => {
    const result = transformProduct({ id: 'prod-abc', title: 'Gadget' })
    expect(result.id).toBe('prod-abc')
    expect(result.title).toBe('Gadget')
  })

  it('falls back to Name/name for title', () => {
    const result = transformProduct({ Id: '1', Name: 'Fallback Name' })
    expect(result.title).toBe('Fallback Name')

    const result2 = transformProduct({ Id: '2', name: 'camel fallback' })
    expect(result2.title).toBe('camel fallback')
  })

  it('maps IsActive: true → status ACTIVE', () => {
    const result = transformProduct({ Id: '1', Title: 'Active Product', IsActive: true })
    expect(result.status).toBe('ACTIVE')
    expect(result.id).toBe('1')
  })

  it('maps IsActive: false → status DRAFT', () => {
    const result = transformProduct({ Id: '2', Title: 'Draft Product', IsActive: false })
    expect(result.status).toBe('DRAFT')
    expect(result.id).toBe('2')
  })

  it('omits status when IsActive is absent', () => {
    const result = transformProduct({ Id: '3', Title: 'No Status' })
    expect(result.status).toBeUndefined()
  })

  it('converts DateCreated to ISO datetime with milliseconds', () => {
    const result = transformProduct({
      Id: '10',
      Title: 'Dated',
      DateCreated: '2024-01-15T10:00:00Z',
    })
    expect(result.createdAt).toBe('2024-01-15T10:00:00.000Z')
    expect(result.id).toBe('10')
  })

  it('converts DateModified to ISO datetime', () => {
    const result = transformProduct({
      Id: '11',
      Title: 'Modified',
      DateModified: '2024-06-01T08:30:00Z',
    })
    expect(result.updatedAt).toBe('2024-06-01T08:30:00.000Z')
    expect(result.title).toBe('Modified')
  })

  it('maps Units array to variants', () => {
    const result = transformProduct({
      Id: 'p1',
      Title: 'Multi-variant',
      Currency: 'EUR',
      Units: [
        { Id: 'u1', Price: 19.99 },
        { Id: 'u2', Price: 29.99 },
      ],
    })
    expect(result.variants).toHaveLength(2)
    expect(result.variants![0].id).toBe('u1')
    expect(result.variants![1].id).toBe('u2')
  })

  it('converts unit price via majorToMinor', () => {
    const result = transformProduct({
      Id: 'p2',
      Title: 'Priced',
      Currency: 'EUR',
      Units: [{ Id: 'u1', Price: 19.99 }],
    })
    expect(result.variants![0].price.amount).toBe(1999)
    expect(result.variants![0].price.currency).toBe('EUR')
  })

  it('converts ListPrice to compareAtPrice', () => {
    const result = transformProduct({
      Id: 'p3',
      Title: 'On Sale',
      Currency: 'USD',
      Units: [{ Id: 'u1', Price: 19.99, ListPrice: 29.99 }],
    })
    expect(result.variants![0].compareAtPrice?.amount).toBe(2999)
    expect(result.variants![0].compareAtPrice?.currency).toBe('USD')
  })

  it('maps Images with Url to images array', () => {
    const result = transformProduct({
      Id: 'p4',
      Title: 'With Images',
      Images: [
        { Url: 'https://example.com/img1.jpg', AltText: 'Front view' },
        { Url: 'https://example.com/img2.jpg' },
      ],
    })
    expect(result.images).toHaveLength(2)
    expect(result.images![0].url).toBe('https://example.com/img1.jpg')
    expect(result.images![0].alt).toBe('Front view')
  })

  it('maps VariantValues on unit to optionValues record', () => {
    const result = transformProduct({
      Id: 'p5',
      Title: 'With Options',
      Currency: 'EUR',
      Units: [
        {
          Id: 'u1',
          Price: 10,
          VariantValues: [
            { Name: 'Color', Value: 'Red' },
            { Name: 'Size', Value: 'M' },
          ],
        },
      ],
    })
    expect(result.variants![0].optionValues).toEqual({ Color: 'Red', Size: 'M' })
    expect(result.options).toHaveLength(2)
  })

  it('uses default currency EUR when Currency is absent', () => {
    const result = transformProduct({
      Id: 'p6',
      Title: 'No Currency',
      Units: [{ Id: 'u1', Price: 5.0 }],
    })
    expect(result.variants![0].price.currency).toBe('EUR')
    expect(result.id).toBe('p6')
  })

  it('passes ProductSchema.parse without throwing', () => {
    const result = transformProduct({
      Id: 'schema-test',
      Title: 'Schema Valid',
      IsActive: true,
      Currency: 'USD',
      DateCreated: '2024-03-10T12:00:00Z',
      Units: [{ Id: 'u1', Price: 25.0, ListPrice: 30.0, Sku: 'SKU-001' }],
      Images: [{ Url: 'https://example.com/img.jpg' }],
    })
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})

describe('transformVariant', () => {
  it('maps Id to id and uses provided productId', () => {
    const result = transformVariant({ Id: 99, Price: 10 }, 'prod-1', 'EUR')
    expect(result.id).toBe('99')
    expect(result.productId).toBe('prod-1')
  })

  it('falls back to Sku for id when Id is absent', () => {
    const result = transformVariant({ Sku: 'SKU-XYZ', Price: 5 }, 'prod-2', 'USD')
    expect(result.id).toBe('SKU-XYZ')
    expect(result.sku).toBe('SKU-XYZ')
  })

  it('uses camelCase id and price fields', () => {
    const result = transformVariant({ id: 'v-camel', price: 8.5 }, 'prod-3', 'GBP')
    expect(result.id).toBe('v-camel')
    expect(result.price.amount).toBe(850)
    expect(result.price.currency).toBe('GBP')
  })

  it('omits compareAtPrice when listPrice is zero or absent', () => {
    const withZero = transformVariant({ Id: '1', Price: 10, ListPrice: 0 }, 'p', 'EUR')
    expect(withZero.compareAtPrice).toBeUndefined()

    const withAbsent = transformVariant({ Id: '2', Price: 10 }, 'p', 'EUR')
    expect(withAbsent.compareAtPrice).toBeUndefined()
  })
})
