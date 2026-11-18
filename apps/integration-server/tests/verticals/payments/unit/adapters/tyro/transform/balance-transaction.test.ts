import { describe, it, expect } from 'vitest'
import {
  transformBalanceTransaction,
  type RawStripeBalanceTransaction,
} from '../../../../../../../src/verticals/payments/adapters/tyro/transform/balance-transaction'
import { BalanceTransactionSchema } from '../../../../../../../src/verticals/payments/schema/balance-transaction'

describe('tyro transformBalanceTransaction', () => {
  it('maps a charge balance transaction', () => {
    const raw: RawStripeBalanceTransaction = {
      id: 'txn_tyro_001',
      object: 'balance_transaction',
      type: 'charge',
      amount: 7500,
      currency: 'aud',
      net: 7320,
      fee: 180,
      source: 'ch_tyro_001',
      created: 1709251200,
    }
    const result = transformBalanceTransaction(raw)
    expect(result.id).toBe('txn_tyro_001')
    expect(result.type).toBe('charge')
    expect(result.amount).toBe(7500)
    expect(result.currency).toBe('AUD')
    expect(result.gateway).toBe('stripe')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps a payout balance transaction', () => {
    const raw: RawStripeBalanceTransaction = {
      id: 'txn_tyro_002',
      object: 'balance_transaction',
      type: 'payout',
      amount: -50000,
      currency: 'aud',
      net: -50000,
      created: 1709337600,
    }
    const result = transformBalanceTransaction(raw)
    expect(result.type).toBe('payout')
    expect(result.amount).toBe(-50000)
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps fee details correctly with uppercase currency', () => {
    const raw: RawStripeBalanceTransaction = {
      id: 'txn_tyro_003',
      object: 'balance_transaction',
      type: 'refund',
      amount: -3000,
      currency: 'aud',
      fee: 0,
      fee_details: [{ amount: 0, currency: 'aud', type: 'stripe_fee', description: 'Refund fee' }],
      net: -3000,
      created: 1709424000,
    }
    const result = transformBalanceTransaction(raw)
    expect(result.type).toBe('refund')
    expect(result.feeDetails![0].currency).toBe('AUD')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })
})
