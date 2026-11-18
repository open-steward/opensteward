import { describe, it, expect } from 'vitest'
import {
  transformBalanceTransaction,
  type RawStripeBalanceTransaction,
} from '../../../../../../../src/verticals/payments/adapters/spoton/transform/balance-transaction'
import { BalanceTransactionSchema } from '../../../../../../../src/verticals/payments/schema/balance-transaction'

describe('spoton transformBalanceTransaction', () => {
  it('maps a charge-type balance transaction', () => {
    const raw: RawStripeBalanceTransaction = {
      id: 'txn_spoton_1',
      object: 'balance_transaction',
      type: 'charge',
      amount: 5000,
      currency: 'usd',
      fee: 175,
      net: 4825,
      source: 'ch_spoton_1',
      description: 'Charge for order #42',
      available_on: 1709251200,
      created: 1709251200,
    }
    const result = transformBalanceTransaction(raw)
    expect(result.id).toBe('txn_spoton_1')
    expect(result.type).toBe('charge')
    expect(result.amount).toBe(5000)
    expect(result.currency).toBe('USD')
    expect(result.sourceId).toBe('ch_spoton_1')
    expect(result.gateway).toBe('stripe')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps a refund-type transaction', () => {
    const raw: RawStripeBalanceTransaction = {
      id: 'txn_spoton_2',
      object: 'balance_transaction',
      type: 'refund',
      amount: -1000,
      currency: 'eur',
      source: 're_spoton_1',
      created: 1709251200,
    }
    const result = transformBalanceTransaction(raw)
    expect(result.type).toBe('refund')
    expect(result.amount).toBe(-1000)
    expect(result.currency).toBe('EUR')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps fee_details to feeDetails array', () => {
    const raw: RawStripeBalanceTransaction = {
      id: 'txn_spoton_3',
      object: 'balance_transaction',
      type: 'charge',
      amount: 10000,
      currency: 'usd',
      fee: 320,
      fee_details: [
        { amount: 290, currency: 'usd', type: 'stripe_fee', description: 'Stripe processing fee' },
        { amount: 30, currency: 'usd', type: 'application_fee' },
      ],
      created: 1709251200,
    }
    const result = transformBalanceTransaction(raw)
    expect(result.feeDetails).toHaveLength(2)
    expect(result.feeDetails![0]!.currency).toBe('USD')
    expect(result.feeDetails![0]!.amount).toBe(290)
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps a payout type', () => {
    const raw: RawStripeBalanceTransaction = {
      id: 'txn_spoton_4',
      object: 'balance_transaction',
      type: 'payout',
      amount: -20000,
      currency: 'usd',
      source: 'po_spoton_1',
      created: 1709251200,
    }
    const result = transformBalanceTransaction(raw)
    expect(result.type).toBe('payout')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })
})
