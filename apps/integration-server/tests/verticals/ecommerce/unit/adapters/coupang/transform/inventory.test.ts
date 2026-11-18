import { describe, it, expect } from 'vitest'
import {
  buildStockUpdateBody,
  transformInventoryLevel,
} from '../../../../../../../src/verticals/ecommerce/adapters/coupang/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'
import { stockExample } from '../fixtures'

describe('transformInventoryLevel (Coupang vendor-item stock)', () => {
  it('maps the documented example and parses as a canonical InventoryLevel', () => {
    const level = InventoryLevelSchema.parse(
      transformInventoryLevel(stockExample(), '3000000000', '74010'),
    )
    expect(level).toEqual(
      expect.objectContaining({
        id: '3000000000:74010',
        variantId: '3000000000',
        locationId: '74010',
        available: 0,
      }),
    )
    expect(level.onHand).toBeUndefined()
  })

  it('reads amountInStock as available', () => {
    const level = InventoryLevelSchema.parse(
      transformInventoryLevel({ ...stockExample(), amountInStock: 42 }, '3000000000', '74010'),
    )
    expect(level.available).toBe(42)
  })

  it('throws when amountInStock is missing rather than reporting zero', () => {
    const raw = stockExample()
    delete raw.amountInStock
    expect(() => transformInventoryLevel(raw, '3000000000', '74010')).toThrow(/amountInStock/)
  })

  it('keeps the write body the setInventoryLevel method sends', () => {
    expect(buildStockUpdateBody(5)).toEqual({ quantity: 5 })
  })
})
