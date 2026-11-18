import { describe, it, expect } from 'vitest'
import {
  transformPaymentMethod,
  type RawCashfreeInstrument,
} from '../../../../../../../src/verticals/payments/adapters/cashfree/transform/payment-method'
import { PaymentMethodSchema } from '../../../../../../../src/verticals/payments/schema/payment-method'

describe('cashfree transformPaymentMethod', () => {
  it('maps a card instrument with full metadata', () => {
    const raw: RawCashfreeInstrument = {
      customer_id: 'cust-001',
      instrument_id: 'inst-001',
      instrument_type: 'card',
      instrument_display: 'XXXXXXXXXXXX4242',
      instrument_status: 'ACTIVE',
      instrument_uid: 'uid-fingerprint-abc',
      created_at: '2024-03-01T00:00:00Z',
      instrument_meta: {
        card_network: 'VISA',
        card_bank_name: 'Test Bank',
        card_type: 'CREDIT',
        card_token_details: {
          expiry_month: '12',
          expiry_year: '2028',
        },
      },
    }
    const result = transformPaymentMethod(raw)
    expect(result.id).toBe('inst-001')
    expect(result.type).toBe('card')
    expect(result.last4).toBe('4242')
    expect(result.brand).toBe('visa')
    expect(result.expMonth).toBe(12)
    expect(result.expYear).toBe(2028)
    expect(result.bankName).toBe('Test Bank')
    expect(result.customerId).toBe('cust-001')
    expect(result.gateway).toBe('cashfree')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('handles instrument with no meta', () => {
    const raw: RawCashfreeInstrument = {
      instrument_id: 'inst-002',
      instrument_type: 'card',
      customer_id: 'cust-002',
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('card')
    expect(result.last4).toBeUndefined()
    expect(result.expMonth).toBeUndefined()
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })
})
