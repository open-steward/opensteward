import { describe, it, expect } from 'vitest'
import {
  transformPayout,
  type RawHyperswitchPayout,
} from '../../../../../../../src/verticals/payments/adapters/hyperswitch/transform/payout'
import { PayoutSchema } from '../../../../../../../src/verticals/payments/schema/payout'

describe('hyperswitch transformPayout', () => {
  it('maps a success payout to status "paid" with integer amount', () => {
    const raw: RawHyperswitchPayout = {
      payout_id: 'po_001',
      merchant_id: 'merchant_acme',
      amount: 10000,
      currency: 'USD',
      status: 'success',
      payout_type: 'bank',
      connector: 'wise',
      customer_id: 'cus_001',
      created: '2024-03-01T00:00:00Z',
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('paid')
    expect(result.amount).toBe(10000)
    expect(result.currency).toBe('USD')
    expect(result.gateway).toBe('hyperswitch')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps a failed payout with error info', () => {
    const raw: RawHyperswitchPayout = {
      payout_id: 'po_002',
      amount: 5000,
      currency: 'EUR',
      status: 'failed',
      error_code: 'insufficient_funds',
      error_message: 'Account has insufficient funds',
      created: '2024-03-01T00:00:00Z',
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('failed')
    expect(result.failureCode).toBe('insufficient_funds')
    expect(result.failureMessage).toBe('Account has insufficient funds')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps ineligible status to "failed"', () => {
    const raw: RawHyperswitchPayout = {
      payout_id: 'po_003',
      amount: 2000,
      currency: 'GBP',
      status: 'ineligible',
      created: '2024-03-01T00:00:00Z',
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('failed')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps requires_creation and initiated statuses to "pending"', () => {
    const raw: RawHyperswitchPayout = {
      payout_id: 'po_004',
      amount: 3000,
      currency: 'USD',
      status: 'requires_creation',
      created: '2024-03-01T00:00:00Z',
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('pending')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })
})
