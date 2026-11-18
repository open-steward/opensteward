import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  type RawShopeeDiscount,
} from '../../../../../../../src/verticals/ecommerce/adapters/shopee/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makeDiscount(overrides: Partial<RawShopeeDiscount> = {}): RawShopeeDiscount {
  return {
    discount_id: 900100,
    discount_name: 'Lunar New Year Sale',
    start_time: 1706745600, // 2024-02-01T00:00:00Z
    end_time: 1707350400, // 2024-02-08T00:00:00Z
    status: 'ongoing',
    item_list: [
      {
        item_id: 100200300,
        item_promotion_price: 39.9,
        item_original_price: 59.9,
        purchase_limit: 5,
        stock: 100,
      },
      {
        item_id: 100200301,
        item_promotion_price: 19.9,
        item_original_price: 29.9,
        purchase_limit: 10,
        stock: 200,
      },
    ],
    ...overrides,
  }
}

describe('transformDiscount (Shopee)', () => {
  it('uses discount_id as the canonical id', () => {
    const result = transformDiscount(makeDiscount())
    expect(result.id).toBe('900100')
    expect(result.title).toBe('Lunar New Year Sale')
  })

  it('infers FIXED_AMOUNT discount type', () => {
    const result = transformDiscount(makeDiscount())
    expect(result.type).toBe('FIXED_AMOUNT')
  })

  it('computes average discount value across items', () => {
    const result = transformDiscount(makeDiscount())
    // Item 1: 59.9 - 39.9 = 20.0, Item 2: 29.9 - 19.9 = 10.0
    // Average = (20 + 10) / 2 = 15.0
    expect(result.value).toBe(15)
  })

  it('extracts product ids', () => {
    const result = transformDiscount(makeDiscount())
    expect(result.appliesTo).toBe('PRODUCTS')
    expect(result.productIds).toEqual(['100200300', '100200301'])
  })

  it('surfaces purchase limit as usageLimit', () => {
    const result = transformDiscount(makeDiscount())
    expect(result.usageLimit).toBe(5) // from first item
  })

  it('converts timestamps to ISO strings', () => {
    const result = transformDiscount(makeDiscount())
    expect(result.startsAt).toBe('2024-02-01T00:00:00.000Z')
    expect(result.endsAt).toBe('2024-02-08T00:00:00.000Z')
  })

  it('satisfies DiscountSchema and preserves raw in metadata', () => {
    const raw = makeDiscount()
    const result = transformDiscount(raw)
    expect(() => DiscountSchema.parse(result)).not.toThrow()
    expect(result.metadata['discount_id']).toBe(900100)
  })

  it('handles empty item_list gracefully', () => {
    const result = transformDiscount(makeDiscount({ item_list: [] }))
    expect(result.value).toBeUndefined()
    expect(result.productIds).toBeUndefined()
    expect(result.appliesTo).toBeUndefined()
  })

  it('handles missing timestamps', () => {
    const result = transformDiscount(
      makeDiscount({ start_time: undefined, end_time: undefined }),
    )
    expect(result.startsAt).toBeUndefined()
    expect(result.endsAt).toBeUndefined()
  })
})

describe('untransformDiscount (Shopee)', () => {
  it('includes discount_name and time fields', () => {
    const body = untransformDiscount({
      title: 'Flash Sale',
      startsAt: '2024-03-01T00:00:00.000Z',
      endsAt: '2024-03-07T00:00:00.000Z',
    })
    expect(body['discount_name']).toBe('Flash Sale')
    expect(body['start_time']).toBe(Math.floor(new Date('2024-03-01T00:00:00.000Z').getTime() / 1000))
    expect(body['end_time']).toBe(Math.floor(new Date('2024-03-07T00:00:00.000Z').getTime() / 1000))
  })

  it('passes through _shopeeExtra', () => {
    const body = untransformDiscount({
      metadata: { _shopeeExtra: { item_list: [{ item_id: 1 }] } },
    })
    expect(body['item_list']).toEqual([{ item_id: 1 }])
  })

  it('handles empty input gracefully', () => {
    const body = untransformDiscount({})
    expect(body).toEqual({})
  })
})
