/**
 * Shape verified against the raw OpenAPI fragment embedded in
 * https://idosell.readme.io/reference/productsproductsget (GET, id-batch)
 * and https://idosell.readme.io/reference/productsproductssearchpost (POST,
 * paginated search — confirmed to return the identical product shape,
 * including `productStocksData` and `productSizesAttributes`).
 */
import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  untransformProduct,
  type RawIdosellProduct,
} from '../../../../../../../src/verticals/ecommerce/adapters/idosell/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeRaw(overrides: Partial<RawIdosellProduct> = {}): RawIdosellProduct {
  return {
    productId: 901,
    productDisplayedCode: 'KURTKA-ZIMA',
    producerName: 'PolaFashion',
    currencyId: 'pln',
    productRetailPrice: 199.99,
    productIsVisible: 'y',
    productAddingTime: '2024-03-01 10:00:00',
    productModificationTime: '2024-03-02 09:00:00',
    productDescriptionsLangData: [
      { langId: 'eng', productName: 'Winter jacket', productLongDescription: 'A warm winter jacket.' },
    ],
    productSizesAttributes: [
      { sizeId: 'M', sizePanelName: 'M', productSizeCodeExternal: 'JACKET-M', productRetailPrice: 179.99 },
      { sizeId: 'L', sizePanelName: 'L', productSizeCodeExternal: 'JACKET-L' },
    ],
    productImages: [{ productImageId: '701', productImageLargeUrl: 'https://cdn.idosell.com/kurtka.jpg' }],
    ...overrides,
  }
}

describe('transformProduct (idosell)', () => {
  it('maps id, title (from productDescriptionsLangData), description', () => {
    const result = transformProduct(makeRaw())
    expect(result.id).toBe('901')
    expect(result.title).toBe('Winter jacket')
    expect(result.description).toBe('A warm winter jacket.')
  })

  it('maps productIsVisible y/n to ACTIVE/ARCHIVED, and leaves undefined when absent', () => {
    expect(transformProduct(makeRaw({ productIsVisible: 'y' })).status).toBe('ACTIVE')
    expect(transformProduct(makeRaw({ productIsVisible: 'n' })).status).toBe('ARCHIVED')
    expect(transformProduct(makeRaw({ productIsVisible: undefined })).status).toBeUndefined()
  })

  it('maps vendor from producerName', () => {
    expect(transformProduct(makeRaw()).vendor).toBe('PolaFashion')
  })

  it('falls back to productDisplayedCode, then productId, when no language entry exists', () => {
    expect(transformProduct(makeRaw({ productDescriptionsLangData: undefined })).title).toBe('KURTKA-ZIMA')
    expect(
      transformProduct(makeRaw({ productDescriptionsLangData: undefined, productDisplayedCode: undefined }))
        .title,
    ).toBe('901')
  })

  it('maps images', () => {
    const result = transformProduct(makeRaw())
    expect(result.images).toHaveLength(1)
    expect(result.images![0]!.url).toBe('https://cdn.idosell.com/kurtka.jpg')
  })

  it('builds variants from productSizesAttributes, falling back to the product price per size', () => {
    const result = transformProduct(makeRaw())
    expect(result.variants).toHaveLength(2)
    expect(result.variants![0]).toMatchObject({ id: '901:M', sku: 'JACKET-M', price: { amount: 17999, currency: 'PLN' } })
    // L has no own productRetailPrice — falls back to the real product-level price, not zero.
    expect(result.variants![1]).toMatchObject({ id: '901:L', price: { amount: 19999, currency: 'PLN' } })
  })

  it('drops a size with no resolvable price rather than inventing zero', () => {
    const result = transformProduct(
      makeRaw({
        productRetailPrice: undefined,
        productSizesAttributes: [{ sizeId: 'M', sizePanelName: 'M' }],
      }),
    )
    expect(result.variants).toBeUndefined()
  })

  it('produces no variants at all when currencyId is not reported', () => {
    const result = transformProduct(makeRaw({ currencyId: undefined }))
    expect(result.variants).toBeUndefined()
  })

  it('normalises space-separated timestamps to strict ISO UTC', () => {
    const result = transformProduct(makeRaw())
    expect(result.createdAt).toBe('2024-03-01T10:00:00.000Z')
    expect(result.updatedAt).toBe('2024-03-02T09:00:00.000Z')
  })

  it('produces a payload that satisfies ProductSchema', () => {
    expect(() => ProductSchema.parse(transformProduct(makeRaw()))).not.toThrow()
  })

  it('round-trips writable fields via untransformProduct', () => {
    const body = untransformProduct(transformProduct(makeRaw()), 'eng')
    expect(body['productDescriptionsLangData']).toEqual([
      { langId: 'eng', productName: 'Winter jacket', productLongDescription: 'A warm winter jacket.' },
    ])
    // untransformProduct writes the price of the FIRST variant it's handed —
    // that's variant M, which carries its own override price (179.99), not
    // the product's base price (199.99).
    expect(body['productRetailPrice']).toBeCloseTo(179.99)
    expect(body['currencyId']).toBe('PLN')
  })
})
