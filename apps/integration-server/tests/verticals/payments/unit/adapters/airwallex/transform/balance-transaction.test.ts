import { describe, it, expect } from 'vitest'
import {
  transformBalanceTransaction,
  type RawAirwallexTransaction,
} from '../../../../../../../src/verticals/payments/adapters/airwallex/transform/balance-transaction'
import { BalanceTransactionSchema } from '../../../../../../../src/verticals/payments/schema/balance-transaction'

describe('airwallex transformBalanceTransaction', () => {
  it('maps type "payment" to "charge" and scales major-unit amount to minor units', () => {
    const raw: RawAirwallexTransaction = {
      id: 'txn-001',
      type: 'payment',
      amount: 49.99,
      currency: 'usd',
      source_id: 'int-001',
      description: 'Payment for order #42',
      fee: 1.5,
      net: 48.49,
      available_on: '2024-03-03T00:00:00+0000',
      created_at: '2024-03-01T12:00:00+0000',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.id).toBe('txn-001')
    expect(result.type).toBe('charge')
    expect(result.amount).toBe(4999)
    expect(result.currency).toBe('USD')
    expect(result.fee).toBe(150)
    expect(result.net).toBe(4849)
    expect(result.sourceId).toBe('int-001')
    expect(result.gateway).toBe('airwallex')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps type "refund" to "refund"', () => {
    const raw: RawAirwallexTransaction = {
      id: 'txn-002',
      type: 'refund',
      amount: -25.0,
      currency: 'EUR',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.type).toBe('refund')
    expect(result.amount).toBe(-2500)
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps type "transfer" to "payout"', () => {
    const raw: RawAirwallexTransaction = {
      id: 'txn-003',
      type: 'transfer',
      amount: 1000.0,
      currency: 'USD',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.type).toBe('payout')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps type "fee" to "fee"', () => {
    const raw: RawAirwallexTransaction = {
      id: 'txn-004',
      type: 'fee',
      amount: -1.5,
      currency: 'USD',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.type).toBe('fee')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps type "adjustment" to "adjustment"', () => {
    const raw: RawAirwallexTransaction = {
      id: 'txn-005',
      type: 'adjustment',
      amount: 5.0,
      currency: 'USD',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.type).toBe('adjustment')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps type "dispute" to "dispute"', () => {
    const raw: RawAirwallexTransaction = {
      id: 'txn-006',
      type: 'dispute',
      amount: -49.99,
      currency: 'GBP',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.type).toBe('dispute')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps unknown type to "other"', () => {
    const raw: RawAirwallexTransaction = {
      id: 'txn-007',
      type: 'something_weird',
      amount: 0,
      currency: 'USD',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.type).toBe('other')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('omits fee and net when not present in raw', () => {
    const raw: RawAirwallexTransaction = {
      id: 'txn-008',
      type: 'charge',
      amount: 10.0,
      currency: 'USD',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.fee).toBeUndefined()
    expect(result.net).toBeUndefined()
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })
})
