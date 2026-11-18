import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawMegaventoryProduct,
} from '../../../../../../../src/verticals/inventory/adapters/megaventory/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

/**
 * Fixture copied from the live `ProductGet` response example in Megaventory's
 * own service metadata, 2026-09-18
 * (https://api.megaventory.com/v2017a/json/metadata?op=ProductGet).
 */
function raw(over: Partial<RawMegaventoryProduct> = {}): RawMegaventoryProduct {
  return {
    ProductID: 27412,
    ProductType: 'BuyFromSupplier',
    ProductSKU: 'prod111',
    ProductEAN: '',
    ProductDescription: 'Wireless Keyboard',
    ProductLongDescription: 'Bluetooth wireless keyboard, US layout.',
    ProductCategoryID: 17,
    ProductUnitOfMeasurement: '',
    ProductSellingPrice: 49.99,
    ProductPurchasePrice: 22.5,
    ProductUnitCost: 21,
    ProductWeight: 2.5,
    ProductLength: 12,
    ProductBreadth: 8,
    ProductHeight: 7,
    ProductMainSupplierID: 5357,
    ProductCreationDate: '/Date(1530110485503-0000)/',
    IsSellable: true,
    IsPurchasable: true,
    ...over,
  }
}

describe('megaventory products', () => {
  it('produces canonical output that satisfies the schema', () => {
    expect(() => ProductSchema.parse(transformProduct(raw()))).not.toThrow()
  })

  it('reads the name from ProductDescription, not the long description', () => {
    // The field names invite the opposite mapping: ProductDescription is the
    // NAME and ProductLongDescription is the prose. Swapping them puts a
    // paragraph in `name`.
    const p = transformProduct(raw())
    expect(p.name).toBe('Wireless Keyboard')
    expect(p.description).toBe('Bluetooth wireless keyboard, US layout.')
  })

  it('maps identity and sku', () => {
    const p = transformProduct(raw())
    expect(p.id).toBe('27412')
    expect(p.externalId).toBe('27412')
    expect(p.sku).toBe('prod111')
  })

  it('treats an empty EAN as absent rather than as a barcode', () => {
    expect(transformProduct(raw()).upc).toBeUndefined()
    expect(transformProduct(raw({ ProductEAN: '5901234123457' })).upc).toBe('5901234123457')
  })

  it('does not publish a weight or dimensions whose unit the payload never stated', () => {
    // ProductWeight and ProductLength/Breadth/Height carry no unit — the unit
    // is account-level (the service has a separate WeightUnitGet operation).
    // The canonical fields are fixed to grams and centimetres, so emitting 2.5
    // as grams would be wrong by whatever the account's unit happens to be.
    const p = transformProduct(raw())
    expect(p.weightGrams).toBeUndefined()
    expect(p.dimensionsCm).toBeUndefined()
    // The values are not lost — they survive on raw and in metadata.
    expect(p.raw).toMatchObject({ ProductWeight: 2.5 })
    expect(p.metadata['ProductWeight']).toBe('2.5')
  })

  it('does not publish money without a currency', () => {
    // Megaventory carries no currency on a product; canonical Money requires
    // an ISO 4217 code, so a bare 49.99 cannot be expressed honestly.
    const p = transformProduct(raw())
    expect(p.cost).toBeUndefined()
    expect(p.retailPrice).toBeUndefined()
  })

  it('does not render a category id as a category name', () => {
    // ProductCategoryID is 17; a category called "17" is worse than none.
    const p = transformProduct(raw())
    expect(p.category).toBeUndefined()
    expect(p.metadata['ProductCategoryID']).toBe('17')
  })

  it('links the main supplier, and omits the sentinel zero', () => {
    expect(transformProduct(raw()).supplierIds).toEqual(['5357'])
    expect(transformProduct(raw({ ProductMainSupplierID: 0 })).supplierIds).toEqual([])
  })

  it('converts the .NET creation date', () => {
    expect(transformProduct(raw()).createdAt).toBe('2018-06-27T14:41:25.503Z')
  })

  it('drops an unset creation date instead of dating it to the year 1', () => {
    expect(
      transformProduct(raw({ ProductCreationDate: '/Date(-62135596800000-0000)/' })).createdAt,
    ).toBeUndefined()
  })
})
