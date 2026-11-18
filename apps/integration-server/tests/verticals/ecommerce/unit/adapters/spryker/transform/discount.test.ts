import { describe, it, expect } from 'vitest'
import {
  untransformDiscount,
  type RawSprykerVoucher,
} from '../../../../../../../src/verticals/ecommerce/adapters/spryker/transform/discount'

// NOTE: Spryker's discount.ts exports ONLY untransformDiscount — there is no
// transformDiscount function because the Storefront Glue API does not expose a
// top-level discount list endpoint. Tests validate the untransform helper.

describe('untransformDiscount (Spryker)', () => {
  it('wraps code in JSON:API voucher body', () => {
    const body = untransformDiscount({ code: 'PROMO10' })
    expect(body).toMatchObject({
      data: {
        type: 'vouchers',
        attributes: { code: 'PROMO10' },
      },
    })
  })

  it('sets code to undefined when canonical discount has no code', () => {
    const body = untransformDiscount({ title: 'Cart Rule' })
    const data = (body as { data: { attributes: { code: unknown } } }).data
    expect(data.attributes.code).toBeUndefined()
  })

  it('always produces data.type = "vouchers"', () => {
    const body = untransformDiscount({})
    expect((body as { data: { type: string } }).data.type).toBe('vouchers')
  })
})

// Verify the RawSprykerVoucher type shape is exported correctly (compile-time check).
// This dummy use ensures the import is exercised.
const _dummy: RawSprykerVoucher = {
  type: 'vouchers',
  id: 'v-1',
  attributes: {
    displayName: 'Test Voucher',
    code: 'TEST',
    discountType: 'voucher',
    amount: 1000,
    isExclusive: false,
    expirationDateTime: '2024-12-31T23:59:59.000Z',
  },
}
// Suppress unused variable warning
void _dummy
