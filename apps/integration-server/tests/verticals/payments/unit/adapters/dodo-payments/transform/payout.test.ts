import { describe, it, expect } from 'vitest'
import {
  transformPayout,
  type RawDodoPayout,
} from '../../../../../../../src/verticals/payments/adapters/dodo-payments/transform/payout'
import { PayoutSchema } from '../../../../../../../src/verticals/payments/schema/payout'

describe('dodo-payments transformPayout', () => {
  it('maps a success payout to status "paid"', () => {
    const raw: RawDodoPayout = {
      payout_id: 'po_001',
      business_id: 'biz_001',
      payment_method: 'bank_transfer',
      status: 'success',
      amount: 50000,
      fee: 250,
      tax: 0,
      currency: 'usd',
      name: 'Weekly settlement',
      remarks: null,
      payout_document_url: 'https://docs.example.com/po_001',
      created_at: '2024-03-01T00:00:00Z',
      updated_at: '2024-03-01T00:00:00Z',
    }
    const result = transformPayout(raw)
    expect(result.id).toBe('po_001')
    expect(result.externalId).toBe('po_001')
    expect(result.status).toBe('paid')
    expect(result.amount).toBe(50000)
    expect(result.currency).toBe('USD')
    expect(result.method).toBe('standard')
    expect(result.statementDescriptor).toBe('Weekly settlement')
    expect(result.gateway).toBe('dodo-payments')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps "in_progress" to "in_transit"', () => {
    const raw: RawDodoPayout = {
      payout_id: 'po_002',
      status: 'in_progress',
      amount: 10000,
      currency: 'USD',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('in_transit')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps "not_initiated" to "pending"', () => {
    const raw: RawDodoPayout = {
      payout_id: 'po_003',
      status: 'not_initiated',
      amount: 5000,
      currency: 'USD',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('pending')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps "failed" status and preserves remarks as failureMessage', () => {
    const raw: RawDodoPayout = {
      payout_id: 'po_004',
      status: 'failed',
      amount: 7500,
      currency: 'USD',
      remarks: 'Insufficient funds in payout account',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('failed')
    expect(result.failureMessage).toBe('Insufficient funds in payout account')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })
})
