import { describe, it, expect } from 'vitest'
import { transformPaymentMethod } from '../../../../../../../src/verticals/payments/adapters/paydock/transform/payment-method'
import { PaymentMethodSchema } from '../../../../../../../src/verticals/payments/schema/payment-method'
import { DOC_CUSTOMER } from '../fixtures/docs'

const SRC = DOC_CUSTOMER.payment_sources[0]!
const OWNER = { customerId: DOC_CUSTOMER._id, defaultSourceId: DOC_CUSTOMER.default_source }

describe('paydock transformPaymentMethod', () => {
  it('maps the documented card payment source', () => {
    const pm = PaymentMethodSchema.parse(transformPaymentMethod(SRC, OWNER))
    expect(pm.id).toBe('620628ef41f03d6f3f87fbf2')
    expect(pm.customerId).toBe('620628ed41f03d6f3f87fbf1')
    expect(pm.type).toBe('card')
    expect(pm.brand).toBe('visa')
    expect(pm.last4).toBe('4242')
    expect(pm.expMonth).toBe(5)
    expect(pm.expYear).toBe(2022)
    expect(pm.holderName).toBe('Test User')
    expect(pm.isDefault).toBe(true)
    expect(pm.createdAt).toBe('2022-02-11T09:14:23.174Z')
    expect(pm.updatedAt).toBe('2022-02-11T09:14:23.281Z')
  })

  it('reads string mm / yyyy expiry ("string(mm)", "string(yyyy)")', () => {
    const pm = transformPaymentMethod({ ...SRC, expire_month: '09', expire_year: '2031' }, OWNER)
    expect(pm.expMonth).toBe(9)
    expect(pm.expYear).toBe(2031)
  })

  it('maps a bank_account source to account_name / account_bank_name', () => {
    const pm = PaymentMethodSchema.parse(
      transformPaymentMethod(
        {
          _id: '5ece5ed2bf87e8587723dd46',
          type: 'bank_account',
          account_name: 'Jane',
          account_bank_name: 'ANZ',
        },
        { customerId: 'c1', defaultSourceId: 'other' },
      ),
    )
    expect(pm.type).toBe('bank_account')
    expect(pm.holderName).toBe('Jane')
    expect(pm.bankName).toBe('ANZ')
    expect(pm.isDefault).toBe(false)
  })

  it('maps checkout to other and an undocumented type to unknown', () => {
    expect(transformPaymentMethod({ _id: 'a', type: 'checkout' }, OWNER).type).toBe('other')
    expect(transformPaymentMethod({ _id: 'a', type: 'paypal' }, OWNER).type).toBe('unknown')
  })

  it('throws without _id', () => {
    expect(() => transformPaymentMethod({ type: 'card' }, OWNER)).toThrow(/_id/)
  })

  it('drops an expire_month outside 1..12', () => {
    expect(transformPaymentMethod({ ...SRC, expire_month: 13 }, OWNER).expMonth).toBeUndefined()
    expect(transformPaymentMethod({ ...SRC, expire_month: 0 }, OWNER).expMonth).toBeUndefined()
  })
})
