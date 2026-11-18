/**
 * Fixtures built from SellerRebateDto and its benefit specifications in
 * https://developer.allegro.pl/swagger.yaml (GET /sale/loyalty/promotions).
 */
import { describe, expect, it } from 'vitest'
import {
  transformDiscount,
  type RawAllegroPromotion,
} from '../../../../../../../src/verticals/ecommerce/adapters/allegro/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

const ID = '7c9a76d3-9fd0-4d13-a4ce-5d49bec12c79'

describe('transformDiscount (Allegro)', () => {
  // swagger.yaml MultiPackBenefitSpecification example: percentage 100,
  // forEachQuantity 3, discountedNumber 1 = "buy 3, the 3rd is free". That is
  // BUY_X_GET_Y, not 100% off the purchase, so no PERCENTAGE value is emitted.
  it('maps a multipack (UNIT_PERCENTAGE_DISCOUNT) on listed offers as BUY_X_GET_Y', () => {
    const raw: RawAllegroPromotion = {
      id: ID,
      status: 'ACTIVE',
      createdAt: '2019-05-01T10:12:32.321Z',
      benefits: [
        {
          specification: {
            type: 'UNIT_PERCENTAGE_DISCOUNT',
            configuration: { percentage: 100 },
            trigger: { forEachQuantity: 3, discountedNumber: 1 },
          },
        },
      ],
      offerCriteria: [{ type: 'CONTAINS_OFFERS', offers: [{ id: '1233432' }] }],
    }
    expect(DiscountSchema.parse(transformDiscount(raw))).toEqual({
      id: ID,
      type: 'BUY_X_GET_Y',
      appliesTo: 'PRODUCTS',
      productIds: ['1233432'],
      createdAt: '2019-05-01T10:12:32.321Z',
      metadata: raw,
    })
  })

  it('maps a one-threshold large order discount with its minimum order value', () => {
    const raw: RawAllegroPromotion = {
      id: ID,
      status: 'ACTIVE',
      benefits: [
        {
          specification: {
            type: 'LARGE_ORDER_DISCOUNT',
            thresholds: [
              {
                orderValue: { lowerBound: { amount: '123.45', currency: 'PLN' } },
                discount: { percentage: '5' },
              },
            ],
          },
        },
      ],
      offerCriteria: [{ type: 'OFFERS_ASSIGNED_EXTERNALLY' }],
    }
    const d = DiscountSchema.parse(transformDiscount(raw))
    expect(d.type).toBe('PERCENTAGE')
    expect(d.value).toBe(5)
    expect(d.minimumPurchaseAmount).toEqual({ amount: 12345, currency: 'PLN' })
    expect(d).not.toHaveProperty('appliesTo')
    expect(d).not.toHaveProperty('productIds')
  })

  it('leaves value out of a tiered wholesale price list and titles it by name', () => {
    const raw: RawAllegroPromotion = {
      id: ID,
      status: 'INACTIVE',
      benefits: [
        {
          specification: {
            type: 'WHOLESALE_PRICE_LIST',
            name: 'Cardboard boxes',
            thresholds: [
              { quantity: { lowerBound: 100 }, discount: { percentage: '5' } },
              { quantity: { lowerBound: 200 }, discount: { percentage: '10' } },
            ],
          },
        },
      ],
      offerCriteria: [{ type: 'ALL_OFFERS' }],
    }
    const d = DiscountSchema.parse(transformDiscount(raw))
    expect(d.title).toBe('Cardboard boxes')
    expect(d.type).toBe('PERCENTAGE')
    expect(d.value).toBeUndefined()
    expect(d.minimumPurchaseAmount).toBeUndefined()
  })

  it('gives a tiered large order discount neither a value nor a minimum order value', () => {
    const raw: RawAllegroPromotion = {
      id: ID,
      status: 'ACTIVE',
      benefits: [
        {
          specification: {
            type: 'LARGE_ORDER_DISCOUNT',
            thresholds: [
              {
                orderValue: { lowerBound: { amount: '100.00', currency: 'PLN' } },
                discount: { percentage: '5' },
              },
              {
                orderValue: { lowerBound: { amount: '200.00', currency: 'PLN' } },
                discount: { percentage: '10' },
              },
            ],
          },
        },
      ],
      offerCriteria: [{ type: 'ALL_OFFERS' }],
    }
    const d = DiscountSchema.parse(transformDiscount(raw))
    expect(d.type).toBe('PERCENTAGE')
    expect(d).not.toHaveProperty('value')
    expect(d).not.toHaveProperty('minimumPurchaseAmount')
  })

  it('leaves type and value out for an undocumented specification type', () => {
    const raw: RawAllegroPromotion = {
      id: ID,
      status: 'ACTIVE',
      benefits: [{ specification: { type: 'SOMETHING_NEW', configuration: { percentage: 20 } } }],
      offerCriteria: [{ type: 'ALL_OFFERS' }],
    }
    const d = DiscountSchema.parse(transformDiscount(raw))
    expect(d).not.toHaveProperty('type')
    expect(d).not.toHaveProperty('value')
  })
})
