import { describe, it, expect } from 'vitest'
import { transformPaymentMethod } from '../../../../../../../src/verticals/payments/adapters/rebilly/transform/payment-method'
import { PaymentMethodSchema } from '../../../../../../../src/verticals/payments/schema/payment-method'

// PaymentCard.yaml / BankAccount.yaml / PayPalAccount.yaml.
describe('rebilly transformPaymentMethod', () => {
  it('maps a payment card', () => {
    expect(
      PaymentMethodSchema.parse(
        transformPaymentMethod({
          id: 'inst_0YVB8KPKNXCBR9EDX7JHSED75N',
          customerId: 'cus_1',
          method: 'payment-card',
          last4: '4242',
          brand: 'Visa',
          expMonth: 12,
          expYear: 2028,
          fingerprint: 'fp1',
          bankName: 'Acme Bank',
          billingAddress: { firstName: 'Jane', lastName: 'Doe' },
          createdTime: '2026-01-15T00:00:00Z',
        }),
      ),
    ).toMatchObject({
      type: 'card',
      last4: '4242',
      brand: 'Visa',
      expMonth: 12,
      expYear: 2028,
      holderName: 'Jane Doe',
      bankName: 'Acme Bank',
    })
  })

  it.each([
    ['ach', 'bank_account'],
    ['paypal', 'wallet'],
    ['Alipay', 'other'],
  ])('maps method %s to %s', (method, type) => {
    expect(PaymentMethodSchema.parse(transformPaymentMethod({ id: 'inst_1', method })).type).toBe(
      type,
    )
  })
})
