/**
 * Shape verified against `components.schemas.Promotion`,
 * `PromotionBenefit`, `PromotionBenefitCommonDiscount`, `PromotionCoupon`
 * and `PromotionValidity` on
 * https://128.koronacloud.com/web/api/v3/openapi.json.
 */
import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  type KoronaPromotion,
} from '../../../../../../../src/verticals/ecommerce/adapters/korona-pos/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makeRaw(overrides: Partial<KoronaPromotion> = {}): KoronaPromotion {
  return {
    id: '77777777-7777-7777-7777-777777777777',
    name: 'Spring Sale 10%',
    type: 'COUPON_DISCOUNT',
    coupon: { text: 'SPRING10' },
    benefit: {
      type: 'COMMON',
      common: { unitType: 'PERCENTAGE', value: 10, applianceTarget: 'PRODUCT', targetProduct: { id: '44444444-4444-4444-4444-444444444444' } },
    },
    validity: { dateInterval: { from: '2024-03-01', to: '2024-03-31' } },
    ...overrides,
  }
}

describe('transformDiscount (korona-pos)', () => {
  it('maps id, code, title, type, value', () => {
    const result = transformDiscount(makeRaw())
    expect(result.id).toBe('77777777-7777-7777-7777-777777777777')
    expect(result.code).toBe('SPRING10')
    expect(result.title).toBe('Spring Sale 10%')
    expect(result.type).toBe('PERCENTAGE')
    expect(result.value).toBe(10)
  })

  it('maps FIXED unitType to FIXED_AMOUNT with no invented currency', () => {
    const result = transformDiscount(
      makeRaw({ benefit: { type: 'COMMON', common: { unitType: 'FIXED', value: 5 } } }),
    )
    expect(result.type).toBe('FIXED_AMOUNT')
    expect(result.value).toBe(5)
    expect(result.currency).toBeUndefined()
  })

  it('maps applianceTarget PRODUCT to appliesTo PRODUCTS and the target product id', () => {
    const result = transformDiscount(makeRaw())
    expect(result.appliesTo).toBe('PRODUCTS')
    expect(result.productIds).toEqual(['44444444-4444-4444-4444-444444444444'])
  })

  it('maps validity.dateInterval to startsAt/endsAt', () => {
    const result = transformDiscount(makeRaw())
    expect(result.startsAt).toBe('2024-03-01T00:00:00.000Z')
    expect(result.endsAt).toBe('2024-03-31T00:00:00.000Z')
  })

  it('leaves every field but id/metadata undefined for a promotion kind with no verified shape', () => {
    const result = transformDiscount(makeRaw({ type: 'BONUSPOINTS_CASHIER', benefit: undefined, coupon: undefined }))
    expect(result.id).toBe('77777777-7777-7777-7777-777777777777')
    expect(result.title).toBeUndefined()
    expect(result.type).toBeUndefined()
    expect(result.value).toBeUndefined()
  })

  it('leaves every field but id/metadata undefined when the benefit type is not COMMON', () => {
    const result = transformDiscount(makeRaw({ benefit: { type: 'GRADUATED_DISCOUNT' } }))
    expect(result.type).toBeUndefined()
    expect(result.value).toBeUndefined()
  })

  it('produces a payload that satisfies DiscountSchema for both mappable and unmappable promotions', () => {
    expect(() => DiscountSchema.parse(transformDiscount(makeRaw()))).not.toThrow()
    expect(() =>
      DiscountSchema.parse(transformDiscount(makeRaw({ type: 'STAMPS', benefit: undefined }))),
    ).not.toThrow()
  })

  it('untransformDiscount writes a COMMON-benefit COUPON_DISCOUNT when a code is set', () => {
    const body = untransformDiscount(transformDiscount(makeRaw()))
    expect(body).toMatchObject({
      type: 'COUPON_DISCOUNT',
      name: 'Spring Sale 10%',
      coupon: { codeType: 'CODEWORD', text: 'SPRING10' },
      benefit: { type: 'COMMON', common: { unitType: 'PERCENTAGE', value: 10 } },
    })
  })

  it('untransformDiscount writes IMMEDIATE_DISCOUNT when no code is set', () => {
    const body = untransformDiscount({ title: 'Auto 5% off', type: 'PERCENTAGE', value: 5 })
    expect(body['type']).toBe('IMMEDIATE_DISCOUNT')
    expect(body).not.toHaveProperty('coupon')
  })
})
