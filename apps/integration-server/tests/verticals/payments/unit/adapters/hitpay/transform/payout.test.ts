import { describe, it, expect } from 'vitest'
import {
  transformPayout,
  type RawHitpayTransfer,
} from '../../../../../../../src/verticals/payments/adapters/hitpay/transform/payout'
import { PayoutSchema } from '../../../../../../../src/verticals/payments/schema/payout'

describe('hitpay transformPayout', () => {
  it('maps a completed transfer to status "paid" with last4 from account number', () => {
    const raw: RawHitpayTransfer = {
      id: 'tr-001',
      status: 'completed',
      payment_currency: 'SGD',
      payment_amount: '1500.00',
      source_currency: 'SGD',
      source_amount: '1500.00',
      reference: 'PAYOUT-REF-001',
      beneficiary: {
        id: 'ben-001',
        account_number: '1234567890',
        bank_name: 'DBS Bank',
        holder_name: 'Acme Corp',
        transfer_method: 'FAST',
        transfer_type: 'business',
      },
      created_at: '2024-03-01T00:00:00Z',
      updated_at: '2024-03-01T00:00:00Z',
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('paid')
    expect(result.amount).toBe(150000)
    expect(result.currency).toBe('SGD')
    expect(result.destinationLast4).toBe('7890')
    expect(result.statementDescriptor).toBe('PAYOUT-REF-001')
    expect(result.method).toBe('standard')
    expect(result.gateway).toBe('hitpay')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps a failed transfer to status "failed"', () => {
    const raw: RawHitpayTransfer = {
      id: 'tr-002',
      status: 'failed',
      payment_currency: 'SGD',
      payment_amount: '200.00',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('failed')
    expect(result.amount).toBe(20000)
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('defaults currency to SGD when not provided', () => {
    const raw: RawHitpayTransfer = {
      id: 'tr-003',
      status: 'pending',
      payment_amount: '100.00',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformPayout(raw)
    expect(result.currency).toBe('SGD')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })
})
