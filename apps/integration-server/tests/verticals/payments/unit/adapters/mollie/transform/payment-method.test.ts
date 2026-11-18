import { describe, it, expect } from 'vitest'
import {
  transformPaymentMethod,
  type RawMollieMandate,
} from '../../../../../../../src/verticals/payments/adapters/mollie/transform/payment-method'
import { PaymentMethodSchema } from '../../../../../../../src/verticals/payments/schema/payment-method'

describe('mollie transformPaymentMethod', () => {
  it('maps a credit card mandate with last4 and holder name', () => {
    const raw: RawMollieMandate = {
      id: 'mdt_1',
      customerId: 'cst_abc',
      method: 'creditcard',
      status: 'valid',
      details: {
        cardHolder: 'Jane Doe',
        cardNumber: '4111111111114242',
        cardLabel: 'Visa',
        cardExpiryDate: '2028-12',
      },
      createdAt: '2023-11-01T00:00:00+00:00',
    }
    const result = transformPaymentMethod(raw)

    expect(result.id).toBe('mdt_1')
    expect(result.customerId).toBe('cst_abc')
    expect(result.type).toBe('card')
    expect(result.brand).toBe('Visa')
    expect(result.last4).toBe('4242')
    expect(result.holderName).toBe('Jane Doe')
    expect(result.gateway).toBe('mollie')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps a directdebit mandate to bank_account type', () => {
    const raw: RawMollieMandate = {
      id: 'mdt_2',
      customerId: 'cst_def',
      method: 'directdebit',
      status: 'valid',
      details: {
        consumerName: 'Bob Smith',
        consumerAccount: 'NL91ABNA0417164300',
      },
      createdAt: '2023-11-01T00:00:00+00:00',
    }
    const result = transformPaymentMethod(raw)

    expect(result.type).toBe('bank_account')
    expect(result.last4).toBe('4300')
    expect(result.holderName).toBe('Bob Smith')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps a klarna mandate to bnpl type', () => {
    const raw: RawMollieMandate = {
      id: 'mdt_3',
      customerId: 'cst_ghi',
      method: 'klarna',
      status: 'valid',
      createdAt: '2023-11-01T00:00:00+00:00',
    }
    const result = transformPaymentMethod(raw)

    expect(result.type).toBe('bnpl')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })
})
