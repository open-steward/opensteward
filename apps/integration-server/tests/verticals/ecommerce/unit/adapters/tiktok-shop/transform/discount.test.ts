import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  mapDiscountType,
  type RawTikTokActivity,
} from '../../../../../../../src/verticals/ecommerce/adapters/tiktok-shop/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makeActivity(overrides: Partial<RawTikTokActivity> = {}): RawTikTokActivity {
  return {
    id: 'act-001',
    title: 'Summer Sale',
    activity_type: 1, // Fixed Price
    status: 2, // Ongoing
    begin_time: 1704067200,
    end_time: 1706745600,
    product_list: [
      {
        product_id: 'prod-001',
        sku_id: 'sku-001',
        quantity_limit: 5,
        activity_price: '39.99',
        original_price: '59.99',
      },
    ],
    create_time: 1703980800,
    ...overrides,
  }
}

describe('transformDiscount (TikTok Shop)', () => {
  it('uses activity id as canonical id', () => {
    const result = transformDiscount(makeActivity())
    expect(result.id).toBe('act-001')
    expect(result.title).toBe('Summer Sale')
  })

  it('maps Fixed Price (1) to FIXED_AMOUNT', () => {
    const result = transformDiscount(makeActivity())
    expect(result.type).toBe('FIXED_AMOUNT')
  })

  it('maps Direct Discount (2) to PERCENTAGE', () => {
    const result = transformDiscount(makeActivity({ activity_type: 2 }))
    expect(result.type).toBe('PERCENTAGE')
  })

  it('computes average discount value', () => {
    const result = transformDiscount(makeActivity())
    expect(result.value).toBe(2000) // (59.99 - 39.99) * 100
  })

  it('extracts product ids', () => {
    const result = transformDiscount(makeActivity())
    expect(result.appliesTo).toBe('PRODUCTS')
    expect(result.productIds).toEqual(['prod-001'])
  })

  it('extracts quantity limit as usageLimit', () => {
    const result = transformDiscount(makeActivity())
    expect(result.usageLimit).toBe(5)
  })

  it('converts timestamps to ISO strings', () => {
    const result = transformDiscount(makeActivity())
    expect(result.startsAt).toBe('2024-01-01T00:00:00.000Z')
    expect(result.endsAt).toBe('2024-02-01T00:00:00.000Z')
    expect(result.createdAt).toBe('2023-12-31T00:00:00.000Z')
  })

  it('handles empty product list', () => {
    const result = transformDiscount(makeActivity({ product_list: [] }))
    expect(result.value).toBeUndefined()
    expect(result.productIds).toBeUndefined()
    expect(result.appliesTo).toBeUndefined()
  })

  it('satisfies DiscountSchema', () => {
    const result = transformDiscount(makeActivity())
    expect(() => DiscountSchema.parse(result)).not.toThrow()
  })

  it('preserves raw in metadata', () => {
    const result = transformDiscount(makeActivity())
    expect(result.metadata['id']).toBe('act-001')
    expect(result.metadata['activity_type']).toBe(1)
  })
})

describe('mapDiscountType (TikTok Shop)', () => {
  it('maps Flash Sale (3) to FIXED_AMOUNT', () => {
    expect(mapDiscountType(3)).toBe('FIXED_AMOUNT')
  })

  it('defaults to FIXED_AMOUNT for unknown types', () => {
    expect(mapDiscountType(99)).toBe('FIXED_AMOUNT')
    expect(mapDiscountType(undefined)).toBe('FIXED_AMOUNT')
  })
})

describe('untransformDiscount (TikTok Shop)', () => {
  it('includes title and times', () => {
    const body = untransformDiscount({
      title: 'Flash Sale',
      startsAt: '2024-01-01T00:00:00.000Z',
      endsAt: '2024-02-01T00:00:00.000Z',
    })
    expect(body['title']).toBe('Flash Sale')
    expect(body['begin_time']).toBe(1704067200)
    expect(body['end_time']).toBe(1706745600)
  })

  it('maps PERCENTAGE type to activity_type 2', () => {
    const body = untransformDiscount({ type: 'PERCENTAGE' })
    expect(body['activity_type']).toBe(2)
  })

  it('maps FIXED_AMOUNT type to activity_type 1', () => {
    const body = untransformDiscount({ type: 'FIXED_AMOUNT' })
    expect(body['activity_type']).toBe(1)
  })

  it('passes through _tiktokExtra from metadata', () => {
    const body = untransformDiscount({
      metadata: { _tiktokExtra: { custom_field: 'value' } },
    })
    expect(body['custom_field']).toBe('value')
  })
})
