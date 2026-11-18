import { describe, it, expect } from 'vitest'
import {
  transformPayout,
  type RawSezzleSettlementSummary,
} from '../../../../../../../src/verticals/payments/adapters/sezzle/transform/payout'
import { PayoutSchema } from '../../../../../../../src/verticals/payments/schema/payout'

describe('sezzle transformPayout', () => {
  it('maps a completed payout with net_settlement_amount correctly', () => {
    const raw: RawSezzleSettlementSummary = {
      uuid: 'payout-uuid-001',
      payout_currency: 'USD',
      settlement_currency: 'USD',
      payout_date: '2024-03-01T00:00:00Z',
      final_payout_amount: 500.0,
      net_settlement_amount: 490.5,
      forex_fees: 9.5,
      status: 'complete',
    }
    const result = transformPayout(raw)
    expect(result.id).toBe('payout-uuid-001')
    expect(result.externalId).toBe('payout-uuid-001')
    expect(result.amount).toBe(49050)
    expect(result.currency).toBe('USD')
    expect(result.status).toBe('paid')
    expect(result.method).toBe('standard')
    expect(result.gateway).toBe('sezzle')
    expect(result.metadata['forex_fees']).toBe('9.5')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps status "in_transit" correctly and converts major units to minor', () => {
    const raw: RawSezzleSettlementSummary = {
      uuid: 'payout-uuid-002',
      payout_currency: 'USD',
      final_payout_amount: 100.0,
      status: 'in_transit',
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('in_transit')
    expect(result.amount).toBe(10000)
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('defaults unknown status to "pending"', () => {
    const raw: RawSezzleSettlementSummary = {
      uuid: 'payout-uuid-003',
      payout_currency: 'USD',
      net_settlement_amount: 200.0,
      status: 'unknown_status',
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('pending')
    expect(result.amount).toBe(20000)
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('falls back to final_payout_amount when net_settlement_amount absent', () => {
    const raw: RawSezzleSettlementSummary = {
      uuid: 'payout-uuid-004',
      payout_currency: 'USD',
      final_payout_amount: 75.25,
      status: 'paid',
    }
    const result = transformPayout(raw)
    expect(result.amount).toBe(7525)
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })
})
