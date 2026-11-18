import { describe, it, expect } from 'vitest'
import {
  transformPayout,
  type RawIntasendSendMoneyTransaction,
} from '../../../../../../../src/verticals/payments/adapters/intasend/transform/payout'
import { PayoutSchema } from '../../../../../../../src/verticals/payments/schema/payout'

describe('intasend transformPayout', () => {
  it('maps a COMPLETE payout to status "paid" with destinationLast4', () => {
    const raw: RawIntasendSendMoneyTransaction = {
      tracking_id: 'TRK-001',
      amount: '500.00',
      currency: 'KES',
      status: 'COMPLETE',
      account: '0712345678',
      narrative: 'Monthly disbursement',
      created_at: '2024-03-01T00:00:00Z',
      updated_at: '2024-03-01T00:00:00Z',
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('paid')
    expect(result.id).toBe('TRK-001')
    expect(result.amount).toBe(50000)
    expect(result.currency).toBe('KES')
    expect(result.destinationLast4).toBe('5678')
    expect(result.statementDescriptor).toBe('Monthly disbursement')
    expect(result.gateway).toBe('intasend')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps a FAILED payout to status "failed"', () => {
    const raw: RawIntasendSendMoneyTransaction = {
      tracking_id: 'TRK-002',
      amount: '100.00',
      currency: 'KES',
      status: 'FAILED',
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('failed')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps a PENDING payout to status "pending"', () => {
    const raw: RawIntasendSendMoneyTransaction = {
      tracking_id: 'TRK-003',
      amount: '200.00',
      currency: 'KES',
      status: 'PENDING',
      phone_number: '+254700001234',
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('pending')
    expect(result.destinationLast4).toBe('1234')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps a CANCELLED payout to status "cancelled"', () => {
    const raw: RawIntasendSendMoneyTransaction = {
      id: 99,
      amount: '50.00',
      currency: 'KES',
      status: 'CANCELLED',
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('cancelled')
    expect(result.id).toBe('99')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps SUCCESS status to "paid"', () => {
    const raw: RawIntasendSendMoneyTransaction = {
      tracking_id: 'TRK-004',
      amount: '75.00',
      currency: 'KES',
      status: 'SUCCESS',
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('paid')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })
})
