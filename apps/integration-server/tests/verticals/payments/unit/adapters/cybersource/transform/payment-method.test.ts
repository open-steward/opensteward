import { describe, it, expect } from 'vitest'
import {
  transformPaymentMethod,
  type RawCybersourcePaymentInstrument,
} from '../../../../../../../src/verticals/payments/adapters/cybersource/transform/payment-method'
import { PaymentMethodSchema } from '../../../../../../../src/verticals/payments/schema/payment-method'

describe('cybersource transformPaymentMethod', () => {
  it('maps a card payment instrument', () => {
    const raw: RawCybersourcePaymentInstrument = {
      id: 'pi_1',
      default: true,
      state: 'ACTIVE',
      card: {
        expirationMonth: '09',
        expirationYear: '2026',
        type: 'visa',
        suffix: '1234',
      },
      billTo: {
        firstName: 'Alice',
        lastName: 'Green',
        email: 'alice@test.com',
      },
      _embedded: {
        customer: { id: 'tms_cust_1' },
      },
      submitTimeUtc: '2023-11-14T10:00:00Z',
    }
    const result = transformPaymentMethod(raw)

    expect(result.id).toBe('pi_1')
    expect(result.type).toBe('card')
    expect(result.brand).toBe('visa')
    expect(result.last4).toBe('1234')
    expect(result.expMonth).toBe(9)
    expect(result.expYear).toBe(2026)
    expect(result.holderName).toBe('Alice Green')
    expect(result.isDefault).toBe(true)
    expect(result.customerId).toBe('tms_cust_1')
    expect(result.gateway).toBe('cybersource')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps a bank account payment instrument', () => {
    const raw: RawCybersourcePaymentInstrument = {
      id: 'pi_2',
      bankAccount: {
        type: 'checking',
        routingNumber: '021000021',
        suffix: '4567',
        bankName: 'Test Bank',
      },
      submitTimeUtc: '2023-11-14T10:00:00Z',
    }
    const result = transformPaymentMethod(raw)

    expect(result.type).toBe('bank_account')
    expect(result.bankName).toBe('Test Bank')
    expect(result.metadata.bankAccountType).toBe('checking')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('defaults type to other when no card or bank account', () => {
    const raw: RawCybersourcePaymentInstrument = {
      id: 'pi_3',
    }
    const result = transformPaymentMethod(raw)

    expect(result.type).toBe('other')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })
})
