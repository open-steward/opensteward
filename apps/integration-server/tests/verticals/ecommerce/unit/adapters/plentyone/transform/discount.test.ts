import { describe, it, expect } from 'vitest'
import {
  transformCampaign,
  untransformCampaign,
  type RawPlentyOneCouponCampaign,
  type RawPlentyOneCouponCode,
} from '../../../../../../../src/verticals/ecommerce/adapters/plentyone/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makeCampaign(
  overrides: Partial<RawPlentyOneCouponCampaign> = {},
): RawPlentyOneCouponCampaign {
  return {
    id: 200,
    name: 'Summer 10% Off',
    couponType: 1, // percentage
    discount: 10,
    minOrderValue: 50,
    currency: 'EUR',
    validFrom: '2024-06-01T00:00:00.000Z',
    validTo: '2024-08-31T23:59:59.000Z',
    usageLimit: 100,
    usageCount: 5,
    createdAt: '2024-05-01T00:00:00.000Z',
    ...overrides,
  }
}

const makeCode = (overrides: Partial<RawPlentyOneCouponCode> = {}): RawPlentyOneCouponCode => ({
  id: 300,
  campaignId: 200,
  code: 'SUMMER10',
  usageCount: 5,
  ...overrides,
})

describe('plentyone transformCampaign', () => {
  it('maps core discount fields', () => {
    const result = transformCampaign(makeCampaign(), makeCode())
    expect(result.id).toBe('200')
    expect(result.code).toBe('SUMMER10')
    expect(result.title).toBe('Summer 10% Off')
    expect(result.type).toBe('PERCENTAGE')
    // percentage value is kept as-is
    expect(result.value).toBe(10)
  })

  it('maps FIXED_AMOUNT type from couponType 2 and converts to minor units', () => {
    const campaign = makeCampaign({ couponType: 2, discount: 15, currency: 'EUR' })
    const result = transformCampaign(campaign)
    expect(result.type).toBe('FIXED_AMOUNT')
    // 15 EUR = 1500 cents
    expect(result.value).toBe(1500)
  })

  it('maps FREE_SHIPPING from couponType 3', () => {
    const campaign = makeCampaign({ couponType: 3 })
    const result = transformCampaign(campaign)
    expect(result.type).toBe('FREE_SHIPPING')
  })

  it('converts minOrderValue to minor units for minimumPurchaseAmount', () => {
    const result = transformCampaign(makeCampaign(), makeCode())
    // 50 EUR = 5000 cents
    expect(result.minimumPurchaseAmount).toEqual({ amount: 5000, currency: 'EUR' })
  })

  it('maps usage fields', () => {
    const result = transformCampaign(makeCampaign(), makeCode())
    expect(result.usageLimit).toBe(100)
    expect(result.usageCount).toBe(5)
  })

  it('maps date range', () => {
    const result = transformCampaign(makeCampaign(), makeCode())
    expect(result.startsAt).toBe('2024-06-01T00:00:00.000Z')
    expect(result.endsAt).toBe('2024-08-31T23:59:59.000Z')
  })

  it('preserves raw payload in metadata', () => {
    const campaign = makeCampaign()
    const code = makeCode()
    const result = transformCampaign(campaign, code)
    expect((result.metadata as { campaign: unknown }).campaign).toBe(campaign)
    expect((result.metadata as { code: unknown }).code).toBe(code)
  })

  it('produces a payload that satisfies DiscountSchema', () => {
    const result = transformCampaign(makeCampaign(), makeCode())
    expect(() => DiscountSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformCampaign', () => {
    const canonical = transformCampaign(makeCampaign(), makeCode())
    const raw = untransformCampaign(canonical)
    expect(raw.name).toBe('Summer 10% Off')
    expect(raw.couponType).toBe(1)
    expect(raw.usageLimit).toBe(100)
  })
})
