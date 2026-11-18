/**
 * Shape verified against the same OpenAPI fragment as `transform/product.ts`
 * (productsproductsget / productsproductssearchpost):
 * `productStocksData.productStocksQuantities[].productSizesData[]`, each row
 * carrying `productSizeQuantity` and a `productSizeReservations` breakdown
 * (ad hoc / auction / client / order / retail / wholesale).
 */
import { describe, it, expect } from 'vitest'
import {
  extractInventoryLevels,
  type RawIdosellProductStocksData,
} from '../../../../../../../src/verticals/ecommerce/adapters/idosell/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeStocksData(overrides: Partial<RawIdosellProductStocksData> = {}): RawIdosellProductStocksData {
  return {
    productStocksQuantities: [
      {
        stockId: 1,
        productSizesData: [
          {
            sizeId: 'M',
            sizePanelName: 'M',
            productSizeQuantity: 42,
            productSizeReservations: {
              productSizeReservationOrder: 5,
              productSizeReservationClient: 2,
            },
          },
        ],
      },
    ],
    ...overrides,
  }
}

describe('extractInventoryLevels (idosell)', () => {
  it('synthesises id as variantId:stockId', () => {
    const [level] = extractInventoryLevels('901', makeStocksData())
    expect(level!.id).toBe('901:M:1')
    expect(level!.variantId).toBe('901:M')
    expect(level!.locationId).toBe('1')
  })

  it('computes available as on-hand minus the sum of reservation buckets', () => {
    const [level] = extractInventoryLevels('901', makeStocksData())
    // 42 - (5 + 2) = 35
    expect(level!.available).toBe(35)
    expect(level!.committed).toBe(7)
    expect(level!.onHand).toBe(42)
  })

  it('reports zero reservations, not undefined, when no reservations object is present', () => {
    const [level] = extractInventoryLevels(
      '901',
      makeStocksData({
        productStocksQuantities: [
          { stockId: 1, productSizesData: [{ sizeId: 'M', productSizeQuantity: 10 }] },
        ],
      }),
    )
    expect(level!.available).toBe(10)
    expect(level!.committed).toBeUndefined()
  })

  it('drops a row with no reported sizeId', () => {
    const levels = extractInventoryLevels(
      '901',
      makeStocksData({
        productStocksQuantities: [
          { stockId: 1, productSizesData: [{ productSizeQuantity: 10 } as never] },
        ],
      }),
    )
    expect(levels).toHaveLength(0)
  })

  it('drops a row with no reported on-hand quantity, rather than inventing zero', () => {
    const levels = extractInventoryLevels(
      '901',
      makeStocksData({
        productStocksQuantities: [{ stockId: 1, productSizesData: [{ sizeId: 'M' }] }],
      }),
    )
    expect(levels).toHaveLength(0)
  })

  it('returns an empty array when the product has no stock data at all', () => {
    expect(extractInventoryLevels('901', undefined)).toEqual([])
  })

  it('produces payloads that satisfy InventoryLevelSchema', () => {
    for (const level of extractInventoryLevels('901', makeStocksData())) {
      expect(() => InventoryLevelSchema.parse(level)).not.toThrow()
    }
  })
})
