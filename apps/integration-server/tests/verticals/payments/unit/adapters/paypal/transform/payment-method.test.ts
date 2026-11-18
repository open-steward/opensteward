import { describe, it, expect } from 'vitest'
import {
  transformPaymentMethod,
  type RawPayPalVaultToken,
} from '../../../../../../../src/verticals/payments/adapters/paypal/transform/payment-method'
import { PaymentMethodSchema } from '../../../../../../../src/verticals/payments/schema/payment-method'

describe('paypal transformPaymentMethod', () => {
  it('maps a vault card token to canonical PaymentMethod', () => {
    const raw: RawPayPalVaultToken = {
      id: 'TOK-001',
      customer: { id: 'CUST-123' },
      status: 'VAULTED',
      payment_source: {
        card: {
          name: 'Alice Smith',
          last_digits: '4242',
          brand: 'VISA',
          expiry: '2027-09',
          billing_address: {
            address_line_1: '123 Main St',
            admin_area_2: 'Austin',
            postal_code: '78701',
            country_code: 'US',
          },
        },
      },
      create_time: '2024-04-01T00:00:00Z',
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('card')
    expect(result.brand).toBe('visa')
    expect(result.last4).toBe('4242')
    expect(result.expMonth).toBe(9)
    expect(result.expYear).toBe(2027)
    expect(result.customerId).toBe('CUST-123')
    expect(result.holderName).toBe('Alice Smith')
    expect(result.gateway).toBe('paypal')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps a PayPal wallet token to type "wallet"', () => {
    const raw: RawPayPalVaultToken = {
      id: 'TOK-002',
      payment_source: {
        paypal: {
          email_address: 'buyer@paypal.com',
          account_status: 'VERIFIED',
        },
      },
      status: 'VAULTED',
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('wallet')
    expect(result.brand).toBe('paypal')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })
})
