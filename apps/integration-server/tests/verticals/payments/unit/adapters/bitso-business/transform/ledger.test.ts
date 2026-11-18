import { describe, it, expect } from 'vitest'
import {
  transformLedger,
  type RawBitsoLedgerEntry,
} from '../../../../../../../src/verticals/payments/adapters/bitso-business/transform/ledger'
import { BalanceTransactionSchema } from '../../../../../../../src/verticals/payments/schema/balance-transaction'

describe('bitso-business transformLedger', () => {
  it('maps a "funding" operation to type "charge" with correct amount', () => {
    const raw: RawBitsoLedgerEntry = {
      eid: 'ledger-001',
      operation: 'funding',
      created_at: '2024-03-01T00:00:00Z',
      balance_updates: [{ currency: 'mxn', amount: '500.00' }],
    }
    const result = transformLedger(raw)
    expect(result.id).toBe('ledger-001')
    expect(result.type).toBe('charge')
    // 500.00 MXN at 2 decimals → 50000
    expect(result.amount).toBe(50000)
    expect(result.currency).toBe('MXN')
    expect(result.gateway).toBe('bitso-business')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps a "withdrawal" operation to type "payout"', () => {
    const raw: RawBitsoLedgerEntry = {
      eid: 'ledger-002',
      operation: 'withdrawal',
      created_at: '2024-03-01T00:00:00Z',
      balance_updates: [{ currency: 'usd', amount: '200.00' }],
    }
    const result = transformLedger(raw)
    expect(result.type).toBe('payout')
    expect(result.currency).toBe('USD')
    expect(result.amount).toBe(20000)
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps a "trade" operation to type "transfer"', () => {
    const raw: RawBitsoLedgerEntry = {
      eid: 'ledger-003',
      operation: 'trade',
      created_at: '2024-03-01T00:00:00Z',
      balance_updates: [{ currency: 'mxn', amount: '150.00' }],
    }
    const result = transformLedger(raw)
    expect(result.type).toBe('transfer')
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('maps a "fee" operation to type "fee"', () => {
    const raw: RawBitsoLedgerEntry = {
      eid: 'ledger-004',
      operation: 'fee',
      created_at: '2024-03-01T00:00:00Z',
      balance_updates: [{ currency: 'mxn', amount: '5.00' }],
    }
    const result = transformLedger(raw)
    expect(result.type).toBe('fee')
    expect(result.amount).toBe(500)
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('picks the largest-magnitude balance update as primary', () => {
    const raw: RawBitsoLedgerEntry = {
      eid: 'ledger-005',
      operation: 'trade',
      created_at: '2024-03-01T00:00:00Z',
      balance_updates: [
        { currency: 'mxn', amount: '100.00' },
        { currency: 'mxn', amount: '1000.00' },
        { currency: 'mxn', amount: '50.00' },
      ],
    }
    const result = transformLedger(raw)
    // largest is 1000.00 → 100000
    expect(result.amount).toBe(100000)
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })

  it('defaults currency to MXN when balance_updates is empty', () => {
    const raw: RawBitsoLedgerEntry = {
      eid: 'ledger-006',
      operation: 'funding',
      created_at: '2024-03-01T00:00:00Z',
      balance_updates: [],
    }
    const result = transformLedger(raw)
    expect(result.currency).toBe('MXN')
    expect(result.amount).toBe(0)
    expect(() => BalanceTransactionSchema.parse(result)).not.toThrow()
  })
})
