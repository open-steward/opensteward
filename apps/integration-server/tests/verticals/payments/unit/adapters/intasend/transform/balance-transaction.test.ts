import { describe, it, expect } from 'vitest'
import {
  transformBalanceTransaction,
  type RawIntasendTransaction,
} from '../../../../../../../src/verticals/payments/adapters/intasend/transform/balance-transaction'
import { BalanceTransactionSchema } from '../../../../../../../src/verticals/payments/schema/balance-transaction'

describe('intasend transformBalanceTransaction', () => {
  it('maps a SALE transaction to type "charge" with correct amount', () => {
    const raw: RawIntasendTransaction = {
      id: 42,
      invoice: 'INV-001',
      value: '100.00',
      running_balance: '900.00',
      narrative: 'Payment received',
      currency: 'KES',
      trans_type: 'SALE',
      wallet_id: 'wallet-abc',
      created_at: '2024-03-01T00:00:00Z',
      updated_at: '2024-03-01T00:00:00Z',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.type).toBe('charge')
    expect(result.amount).toBe(10000)
    expect(result.currency).toBe('KES')
    expect(result.gateway).toBe('intasend')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps a PAYOUT transaction to type "payout"', () => {
    const raw: RawIntasendTransaction = {
      id: 55,
      invoice: 'INV-002',
      value: '50.00',
      running_balance: '450.00',
      trans_type: 'PAYOUT',
      currency: 'KES',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.type).toBe('payout')
    expect(result.amount).toBe(5000)
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps a WITHDRAWAL transaction to type "payout"', () => {
    const raw: RawIntasendTransaction = {
      id: 66,
      trans_type: 'WITHDRAWAL',
      value: '20.00',
      currency: 'KES',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.type).toBe('payout')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps a CHARGE transaction to type "fee"', () => {
    const raw: RawIntasendTransaction = {
      id: 77,
      trans_type: 'CHARGE',
      value: '1.50',
      currency: 'KES',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.type).toBe('fee')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps an ADJUSTMENT transaction to type "adjustment"', () => {
    const raw: RawIntasendTransaction = {
      id: 88,
      trans_type: 'ADJUSTMENT',
      value: '10.00',
      currency: 'KES',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.type).toBe('adjustment')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps an EXCHANGE transaction to type "transfer"', () => {
    const raw: RawIntasendTransaction = {
      id: 99,
      trans_type: 'EXCHANGE',
      value: '200.00',
      currency: 'USD',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.type).toBe('transfer')
    expect(result.currency).toBe('USD')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('defaults to type "other" for unknown trans_type', () => {
    const raw: RawIntasendTransaction = {
      id: 100,
      trans_type: 'AIRTIME',
      value: '5.00',
      currency: 'KES',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.type).toBe('other')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('defaults currency to KES when absent', () => {
    const raw: RawIntasendTransaction = {
      id: 101,
      trans_type: 'DEPOSIT',
      value: '30.00',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.currency).toBe('KES')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('uses invoice as sourceId and id from invoice when id is absent', () => {
    const raw: RawIntasendTransaction = {
      invoice: 'INV-XYZ',
      trans_type: 'SALE',
      value: '10.00',
      currency: 'KES',
    }
    const result = transformBalanceTransaction(raw)
    expect(result.id).toBe('INV-XYZ')
    expect(result.sourceId).toBe('INV-XYZ')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })
})
