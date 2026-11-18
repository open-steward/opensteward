import { describe, it, expect } from 'vitest'
import {
  transformPaymentMethod,
  type RawModernTreasuryExternalAccount,
} from '../../../../../../../src/verticals/payments/adapters/modern-treasury/transform/payment-method'
import { PaymentMethodSchema } from '../../../../../../../src/verticals/payments/schema/payment-method'

describe('modern-treasury transformPaymentMethod', () => {
  it('maps a checking account to type "bank_account" with last4 and bankName', () => {
    const raw: RawModernTreasuryExternalAccount = {
      id: 'ea-001',
      account_type: 'checking',
      party_name: 'John Doe',
      counterparty_id: 'cp-001',
      account_details: [{ account_number: '123456789012', account_number_type: 'other' }],
      routing_details: [
        { routing_number: '021000021', routing_number_type: 'aba', bank_name: 'Chase' },
      ],
      verification_status: 'verified',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformPaymentMethod(raw)
    expect(result.id).toBe('ea-001')
    expect(result.type).toBe('bank_account')
    expect(result.customerId).toBe('cp-001')
    expect(result.last4).toBe('9012')
    expect(result.bankName).toBe('Chase')
    expect(result.gateway).toBe('modern-treasury')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps a savings account to type "bank_account"', () => {
    const raw: RawModernTreasuryExternalAccount = {
      id: 'ea-002',
      account_type: 'savings',
      counterparty_id: 'cp-002',
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('bank_account')
    expect(result.last4).toBeUndefined()
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })

  it('maps a crypto_wallet account to type "wallet"', () => {
    const raw: RawModernTreasuryExternalAccount = {
      id: 'ea-003',
      account_type: 'crypto_wallet',
      counterparty_id: 'cp-003',
    }
    const result = transformPaymentMethod(raw)
    expect(result.type).toBe('wallet')
    expect(() => PaymentMethodSchema.parse(result)).not.toThrow()
  })
})
