import { describe, it, expect } from 'vitest'
import {
  transformPayout,
  type RawPaystackTransfer,
} from '../../../../../../../src/verticals/payments/adapters/paystack/transform/payout'
import { PayoutSchema } from '../../../../../../../src/verticals/payments/schema/payout'

describe('paystack transformPayout', () => {
  it('maps a successful transfer to status "paid"', () => {
    const raw: RawPaystackTransfer = {
      id: 301,
      transfer_code: 'TRF_code001',
      reference: 'TRF_ref001',
      amount: 50000,
      currency: 'NGN',
      status: 'success',
      reason: 'Monthly settlement',
      transferred_at: '2024-03-01T00:00:00Z',
      recipient: { account_number: '0123456789' },
      createdAt: '2024-03-01T00:00:00Z',
      updatedAt: '2024-03-01T00:00:00Z',
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('paid')
    expect(result.amount).toBe(50000)
    expect(result.currency).toBe('NGN')
    expect(result.destinationLast4).toBe('6789')
    expect(result.statementDescriptor).toBe('Monthly settlement')
    expect(result.gateway).toBe('paystack')
    expect(result.id).toBe('301')
    expect(result.externalId).toBe('TRF_code001')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps a pending transfer to status "pending"', () => {
    const raw: RawPaystackTransfer = {
      id: 302,
      transfer_code: 'TRF_code002',
      amount: 25000,
      currency: 'NGN',
      status: 'pending',
      createdAt: '2024-03-01T00:00:00Z',
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('pending')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps a reversed transfer to status "cancelled"', () => {
    const raw: RawPaystackTransfer = {
      id: 303,
      transfer_code: 'TRF_code003',
      amount: 10000,
      currency: 'NGN',
      status: 'reversed',
      createdAt: '2024-03-01T00:00:00Z',
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('cancelled')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('extracts last4 from nested recipient.details.account_number', () => {
    const raw: RawPaystackTransfer = {
      id: 304,
      transfer_code: 'TRF_code004',
      amount: 15000,
      currency: 'NGN',
      status: 'success',
      recipient: { details: { account_number: '9876543210' } },
      createdAt: '2024-03-01T00:00:00Z',
    }
    const result = transformPayout(raw)
    expect(result.destinationLast4).toBe('3210')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })
})
