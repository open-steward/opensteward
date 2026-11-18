/**
 * Wix Coupon (Coupons API v2) → canonical Discount.
 *
 * Fixtures follow the `Coupon` schema of Query Coupons / Get A Coupon
 * (coupons/coupons/query-coupons.md): everything but `id`, `dateCreated`,
 * `expired` and `numberOfUsages` sits under `specification`. Specification
 * values are those of Create A Coupon's documented examples.
 */
import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  type RawWixCoupon,
} from '../../../../../../../src/verticals/ecommerce/adapters/wix/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makeCoupon(
  spec: RawWixCoupon['specification'] = {},
  overrides: Partial<RawWixCoupon> = {},
): RawWixCoupon {
  return {
    id: 'abeb638b-f9f4-4bb8-8fe7-2319504df6d9',
    specification: {
      name: 'Discount',
      code: 'ABCD',
      active: true,
      startTime: '1719390501000',
      scope: { namespace: 'bookings' },
      moneyOffAmount: 5,
      ...spec,
    },
    dateCreated: '1719390501000',
    expired: false,
    numberOfUsages: 3,
    ...overrides,
  }
}

describe('transformDiscount', () => {
  it('parses with DiscountSchema and reads specification fields', () => {
    const d = DiscountSchema.parse(transformDiscount(makeCoupon()))
    expect(d.id).toBe('abeb638b-f9f4-4bb8-8fe7-2319504df6d9')
    expect(d.code).toBe('ABCD')
    expect(d.title).toBe('Discount')
    expect(d.type).toBe('FIXED_AMOUNT')
    expect(d.usageCount).toBe(3)
  })

  it('a fixed amount has no value or currency: the coupon carries no currency', () => {
    const d = DiscountSchema.parse(transformDiscount(makeCoupon()))
    expect(d.type).toBe('FIXED_AMOUNT')
    expect(d.value).toBeUndefined()
    expect(d.currency).toBeUndefined()
    expect((d.metadata.specification as { moneyOffAmount?: number }).moneyOffAmount).toBe(5)
  })

  it('maps a minimum-subtotal coupon to ORDER, without money', () => {
    const d = DiscountSchema.parse(
      transformDiscount(makeCoupon({ scope: undefined, minimumSubtotal: 5 })),
    )
    expect(d.appliesTo).toBe('ORDER')
    expect(d.minimumPurchaseAmount).toBeUndefined()
  })

  it('turns the millisecond startTime / expirationTime / dateCreated into ISO dates', () => {
    const d = DiscountSchema.parse(
      transformDiscount(makeCoupon({ expirationTime: '1750667301000' })),
    )
    expect(d.startsAt).toBe(new Date(1719390501000).toISOString())
    expect(d.endsAt).toBe(new Date(1750667301000).toISOString())
    expect(d.createdAt).toBe(new Date(1719390501000).toISOString())
  })

  it('usageLimit is specification.usageLimit, not limitPerCustomer', () => {
    const d = transformDiscount(makeCoupon({ usageLimit: 10, limitPerCustomer: 1 }))
    expect(d.usageLimit).toBe(10)
  })

  it('maps a percentOffRate coupon', () => {
    const d = DiscountSchema.parse(
      transformDiscount(
        makeCoupon({
          moneyOffAmount: undefined,
          percentOffRate: 5,
          scope: { namespace: 'events', group: { name: 'ticket' } },
        }),
      ),
    )
    expect(d.type).toBe('PERCENTAGE')
    expect(d.value).toBe(5)
  })

  it('maps a product-scoped coupon to PRODUCTS with the entity id', () => {
    const d = DiscountSchema.parse(
      transformDiscount(
        makeCoupon({
          moneyOffAmount: undefined,
          percentOffRate: 10,
          scope: {
            namespace: 'stores',
            group: { name: 'product', entityId: 'e599b709-1a8b-478a-ae80-26192944aef5' },
          },
        }),
      ),
    )
    expect(d.appliesTo).toBe('PRODUCTS')
    expect(d.productIds).toEqual(['e599b709-1a8b-478a-ae80-26192944aef5'])
    expect(d.collectionIds).toBeUndefined()
  })

  it('maps a collection-scoped coupon to PRODUCTS with the collection id', () => {
    const d = transformDiscount(
      makeCoupon({
        scope: { namespace: 'stores', group: { name: 'collection', entityId: 'col1' } },
      }),
    )
    expect(d.appliesTo).toBe('PRODUCTS')
    expect(d.collectionIds).toEqual(['col1'])
  })

  it('maps a freeShipping coupon with a minimum subtotal to SHIPPING, without money', () => {
    const d = DiscountSchema.parse(
      transformDiscount(
        makeCoupon({
          moneyOffAmount: undefined,
          scope: undefined,
          minimumSubtotal: 5,
          freeShipping: true,
        }),
      ),
    )
    expect(d.type).toBe('FREE_SHIPPING')
    expect(d.appliesTo).toBe('SHIPPING')
    // The coupon has no currency, so no Money is invented from minimumSubtotal.
    expect(d.minimumPurchaseAmount).toBeUndefined()
    expect(d.currency).toBeUndefined()
  })

  it('maps buyXGetY and leaves fixedPriceAmount as unknown with no value', () => {
    const bxgy = DiscountSchema.parse(
      transformDiscount(makeCoupon({ moneyOffAmount: undefined, buyXGetY: { x: 3, y: 2 } })),
    )
    expect(bxgy.type).toBe('BUY_X_GET_Y')
    const fixed = DiscountSchema.parse(
      transformDiscount(makeCoupon({ moneyOffAmount: undefined, fixedPriceAmount: 5 })),
    )
    expect(fixed.type).toBe('unknown')
    expect(fixed.value).toBeUndefined()
  })

  it('refuses a coupon without an id', () => {
    expect(() => transformDiscount(makeCoupon({}, { id: undefined }))).toThrow(/id/)
  })

  it('preserves the raw payload in metadata', () => {
    const raw = makeCoupon()
    expect(transformDiscount(raw).metadata).toBe(raw)
  })
})

describe('untransformDiscount', () => {
  it('maps a percentage discount body', () => {
    const body = untransformDiscount({ title: 'Ten', code: 'TEN', type: 'PERCENTAGE', value: 10 })
    expect(body).toMatchObject({ name: 'Ten', code: 'TEN', percentOffRate: 10 })
  })
})
