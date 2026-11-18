import { describe, it, expect } from 'vitest'
import {
  transformPayout,
  mapPayoutStatus,
} from '../../../../../../../src/verticals/payments/adapters/plaid/transform/payout'
import type { RawPlaidTransfer } from '../../../../../../../src/verticals/payments/adapters/plaid/transform/charge'
import { PayoutSchema } from '../../../../../../../src/verticals/payments/schema/payout'

describe('plaid transformPayout', () => {
  it('maps status "settled" to "paid" and converts decimal amount to minor units', () => {
    const raw: RawPlaidTransfer = {
      id: 'tr_payout_settled',
      type: 'credit',
      amount: '25.00',
      iso_currency_code: 'USD',
      status: 'settled',
      network: 'ach',
      description: 'Vendor payment',
      created: '2024-03-01T00:00:00Z',
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('paid')
    expect(result.amount).toBe(2500)
    expect(result.currency).toBe('USD')
    expect(result.id).toBe('tr_payout_settled')
    expect(result.statementDescriptor).toBe('Vendor payment')
    expect(result.method).toBe('standard')
    expect(result.gateway).toBe('plaid')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps status "posted" to "in_transit"', () => {
    const raw: RawPlaidTransfer = {
      id: 'tr_posted',
      amount: '10.00',
      status: 'posted',
      network: 'ach',
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('in_transit')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps status "pending" to "pending"', () => {
    const raw: RawPlaidTransfer = {
      id: 'tr_pend',
      amount: '5.00',
      status: 'pending',
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('pending')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps status "failed" to "failed"', () => {
    const raw: RawPlaidTransfer = {
      id: 'tr_pfail',
      amount: '7.00',
      status: 'failed',
      failure_reason: { description: 'Account closed', ach_return_code: 'R02' },
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('failed')
    expect(result.failureMessage).toBe('Account closed')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps rtp network to method "instant"', () => {
    const raw: RawPlaidTransfer = {
      id: 'tr_rtp',
      amount: '50.00',
      status: 'settled',
      network: 'rtp',
    }
    const result = transformPayout(raw)
    expect(result.method).toBe('instant')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps status "funds_available" to "paid" via mapPayoutStatus', () => {
    const raw: RawPlaidTransfer = { id: 'tr_fa2', amount: '1.00', status: 'funds_available' }
    expect(mapPayoutStatus(raw)).toBe('paid')
  })
})
