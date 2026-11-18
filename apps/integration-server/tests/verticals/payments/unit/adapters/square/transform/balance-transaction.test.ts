import { describe, it, expect } from 'vitest'
import {
  transformBalanceTransaction,
  type RawSquarePayoutEntry,
} from '../../../../../../../src/verticals/payments/adapters/square/transform/balance-transaction'
import { BalanceTransactionSchema } from '../../../../../../../src/verticals/payments/schema/balance-transaction'

describe('square transformBalanceTransaction', () => {
  it('maps a PAYMENT payout entry to type "charge"', () => {
    const raw: RawSquarePayoutEntry = {
      id: 'ENTRY-001',
      payout_id: 'PAYOUT-001',
      effective_at: '2024-05-01T00:00:00Z',
      type: 'PAYMENT',
      gross_amount_money: { amount: 5000, currency: 'USD' },
      fee_amount_money: { amount: -100, currency: 'USD' },
      net_amount_money: { amount: 4900, currency: 'USD' },
    }
    const result = transformBalanceTransaction(raw)
    expect(result.id).toBe('ENTRY-001')
    expect(result.type).toBe('charge')
    expect(result.amount).toBe(5000)
    expect(result.currency).toBe('USD')
    expect(result.fee).toBe(100)
    expect(result.net).toBe(4900)
    expect(result.sourceId).toBe('PAYOUT-001')
    expect(result.gateway).toBe('square')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps a REFUND payout entry to type "refund"', () => {
    const raw: RawSquarePayoutEntry = {
      id: 'ENTRY-002',
      type: 'REFUND',
      gross_amount_money: { amount: -2000, currency: 'CAD' },
    }
    const result = transformBalanceTransaction(raw)
    expect(result.type).toBe('refund')
    expect(result.amount).toBe(-2000)
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps a FEE entry to type "fee"', () => {
    const raw: RawSquarePayoutEntry = {
      id: 'ENTRY-003',
      type: 'FEE',
      gross_amount_money: { amount: 50, currency: 'USD' },
    }
    const result = transformBalanceTransaction(raw)
    expect(result.type).toBe('fee')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })
})
