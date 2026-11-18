import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  type PayhawkBankStatementEntry,
} from '../../../../../../../src/verticals/accounting/adapters/payhawk/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'

function makeRaw(overrides: Partial<PayhawkBankStatementEntry> = {}): PayhawkBankStatementEntry {
  return {
    id: 'stmt-1',
    type: 'payment',
    date: '2025-06-10',
    currency: 'USD',
    amount: 150.75,
    description: 'Supplier payment',
    // IExpensePaymentFees: one amount per kind, all three required.
    fees: { fx: 0, pos: 0, bank: 2.5 },
    ...overrides,
  }
}

describe('payhawk transformTransaction', () => {
  it('maps id', () => {
    expect(transformTransaction(makeRaw()).id).toBe('stmt-1')
  })

  it('maps type', () => {
    expect(transformTransaction(makeRaw()).type).toBe('payment')
  })

  it('maps description to memo', () => {
    expect(transformTransaction(makeRaw()).memo).toBe('Supplier payment')
  })

  it('maps currency', () => {
    expect(transformTransaction(makeRaw()).currency).toBe('USD')
  })

  it('maps amount to minor units', () => {
    expect(transformTransaction(makeRaw({ amount: 150.75 })).totalAmount).toBe(15075)
  })

  it('maps date to createdAt Date', () => {
    expect(transformTransaction(makeRaw()).createdAt).toBeInstanceOf(Date)
  })

  it('includes main lineitem with amount in minor units', () => {
    const result = transformTransaction(makeRaw())
    expect(result.lineItems?.[0]?.totalAmount).toBe(15075)
  })

  it('includes fee lineitem', () => {
    const result = transformTransaction(makeRaw())
    // lineItems[0] is the main entry, lineItems[1] is the fee
    expect(result.lineItems?.[1]?.name).toBe('fee')
    expect(result.lineItems?.[1]?.description).toBe('Bank fee')
    expect(result.lineItems?.[1]?.totalAmount).toBe(250)
  })

  it('adds one fee lineitem per non-zero kind of fee, and none for a zero', () => {
    const result = transformTransaction(makeRaw({ fees: { fx: 1.25, pos: 0, bank: 0.5 } }))
    expect(result.lineItems?.slice(1)).toEqual([
      { name: 'fee', description: 'FX fee', totalAmount: 125 },
      { name: 'fee', description: 'Bank fee', totalAmount: 50 },
    ])
    const noFees = transformTransaction(makeRaw({ fees: { fx: 0, pos: 0, bank: 0 } }))
    expect(noFees.lineItems).toHaveLength(1)
  })

  it('maps every kind of fee, POS included, each under its own label', () => {
    const result = transformTransaction(makeRaw({ fees: { fx: 1.25, pos: 0.75, bank: 0.5 } }))
    expect(result.lineItems?.slice(1)).toEqual([
      { name: 'fee', description: 'FX fee', totalAmount: 125 },
      { name: 'fee', description: 'POS fee', totalAmount: 75 },
      { name: 'fee', description: 'Bank fee', totalAmount: 50 },
    ])
  })

  it('passes TransactionSchema.parse', () => {
    expect(() => TransactionSchema.parse(transformTransaction(makeRaw()))).not.toThrow()
  })
})
