import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type RawPrestaShopStockAvailable,
} from '../../../../../../../src/verticals/ecommerce/adapters/prestashop/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeStockAvailable(
  overrides: Partial<RawPrestaShopStockAvailable> = {},
): RawPrestaShopStockAvailable {
  return {
    id: 801,
    id_product: 42,
    id_product_attribute: 501,
    id_shop: 1,
    quantity: 17,
    depends_on_stock: 0,
    out_of_stock: 2,
    ...overrides,
  }
}

describe('transformInventoryLevel (PrestaShop)', () => {
  it('synthesises a composite id and default location', () => {
    const result = transformInventoryLevel(makeStockAvailable(), '42')
    expect(result.id).toBe('42:501:default')
    expect(typeof result.id).toBe('string')
    expect(result.variantId).toBe('42:501')
    expect(result.locationId).toBe('default')
    expect(result.available).toBe(17)
  })

  it('uses "default" combination id when id_product_attribute is 0', () => {
    const result = transformInventoryLevel(
      makeStockAvailable({ id_product_attribute: 0 }),
      '42',
    )
    expect(result.variantId).toBe('42:default')
    expect(result.id).toBe('42:default:default')
  })

  it('handles string quantity values', () => {
    const result = transformInventoryLevel(
      makeStockAvailable({ quantity: '25' as unknown as number }),
      '42',
    )
    expect(result.available).toBe(25)
  })

  it('defaults null quantity to 0', () => {
    const result = transformInventoryLevel(
      makeStockAvailable({ quantity: null }),
      '42',
    )
    expect(result.available).toBe(0)
  })

  it('falls back to id_product from raw when productId not provided', () => {
    const result = transformInventoryLevel(makeStockAvailable())
    expect(result.variantId).toBe('42:501')
  })

  it('preserves raw payload in metadata and validates against InventoryLevelSchema', () => {
    const raw = makeStockAvailable()
    const result = transformInventoryLevel(raw, '42')
    expect(result.metadata).toBe(raw)
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })
})
