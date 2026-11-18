import { describe, it, expect } from 'vitest'
import { transformPaymentMethod } from '../../../../../../../src/verticals/payments/adapters/killbill/transform/payment-method'
import { PaymentMethodSchema } from '../../../../../../../src/verticals/payments/schema/payment-method'

// Payment Method resource fields, https://killbill.github.io/slate/payment-method.html
// Example Response of "Retrieve a payment method by id" (truncated to its core attributes)
const DOC_PM = {
  paymentMethodId: '19398506-e8f0-4c60-b504-99f53c3e148d',
  externalKey: '19398506-e8f0-4c60-b504-99f53c3e148d',
  accountId: 'f271e44f-651c-49b9-bc20-5d54e117b570',
  isDefault: false,
  pluginName: 'killbill-braintree',
  pluginInfo: {
    externalPaymentMethodId: '19398506-e8f0-4c60-b504-99f53c3e148d',
    isDefaultPaymentMethod: false,
    properties: [{ key: 'last4', value: '1881', isUpdatable: false }],
  },
}

describe('killbill transformPaymentMethod', () => {
  it('maps the core Kill Bill attributes only', () => {
    const pm = PaymentMethodSchema.parse(transformPaymentMethod(DOC_PM))
    expect(pm.id).toBe('19398506-e8f0-4c60-b504-99f53c3e148d')
    expect(pm.customerId).toBe('f271e44f-651c-49b9-bc20-5d54e117b570')
    expect(pm.isDefault).toBe(false)
    expect(pm.type).toBe('unknown')
    expect(pm.metadata).toEqual({ pluginName: 'killbill-braintree' })
    expect(pm.last4).toBeUndefined()
  })

  it('throws without a paymentMethodId', () => {
    expect(() => transformPaymentMethod({ accountId: 'a' })).toThrow(/paymentMethodId/)
  })
})
