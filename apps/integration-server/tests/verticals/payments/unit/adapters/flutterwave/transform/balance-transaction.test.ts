import { describe, it, expect } from 'vitest'
import {
  transformBalanceTransaction,
  type RawFlutterwaveSettlement,
} from '../../../../../../../src/verticals/payments/adapters/flutterwave/transform/balance-transaction'
import { BalanceTransactionSchema } from '../../../../../../../src/verticals/payments/schema/balance-transaction'

describe('flutterwave transformBalanceTransaction', () => {
  it('maps a settlement to type "payout" with correct gross amount and fee', () => {
    const raw: RawFlutterwaveSettlement = {
      id: 'SET-001',
      gross_amount: 100.0,
      net_amount: 97.0,
      currency: 'NGN',
      status: 'completed',
      destination: 'Bank Account XXXX1234',
      due_datetime: '2024-03-05T00:00:00Z',
      created_datetime: '2024-03-01T00:00:00Z',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.id).toBe('SET-001')
    expect(result.type).toBe('payout')
    expect(result.amount).toBe(10000)
    expect(result.currency).toBe('NGN')
    expect(result.fee).toBe(300)
    expect(result.net).toBe(9700)
    expect(result.availableOn).toBe('2024-03-05T00:00:00Z')
    expect(result.description).toBe('Settlement to Bank Account XXXX1234')
    expect(result.gateway).toBe('flutterwave')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('handles zero fee when gross equals net', () => {
    const raw: RawFlutterwaveSettlement = {
      id: 'SET-002',
      gross_amount: 50.0,
      net_amount: 50.0,
      currency: 'USD',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.fee).toBe(0)
    expect(result.net).toBe(5000)
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('omits description when destination is absent', () => {
    const raw: RawFlutterwaveSettlement = {
      id: 'SET-003',
      gross_amount: 200.0,
      net_amount: 195.0,
      currency: 'GHS',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.description).toBeUndefined()
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('stores charge_count and destination in metadata', () => {
    const raw: RawFlutterwaveSettlement = {
      id: 'SET-004',
      gross_amount: 500.0,
      net_amount: 490.0,
      currency: 'NGN',
      charge_count: 10,
      destination: 'GTBank',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.metadata['charge_count']).toBe('10')
    expect(result.metadata['destination']).toBe('GTBank')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })
})
