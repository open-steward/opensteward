import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import { transformTransaction, type EconomicEntry } from '../../../../../../../src/verticals/accounting/adapters/economic/transform/transaction'

function makeRaw(overrides: Partial<EconomicEntry> = {}): EconomicEntry {
  return {
    entryNumber: 1,
    account: { accountNumber: 1000, name: 'Cash' },
    amount: 500,
    amountInBaseCurrency: 500,
    currency: 'DKK',
    text: 'Payment received',
    date: '2024-08-01',
    entryType: 'CustomerPayment',
    voucherNumber: 42,
    ...overrides,
  }
}

describe('economic transformTransaction', () => {
  it('maps entryNumber to id', () => {
    expect(transformTransaction(makeRaw()).id).toBe('1')
  })
  it('handles fields gracefully', () => {
    expect(() => transformTransaction(makeRaw())).not.toThrow()
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformTransaction(raw).metadata).toBe(raw)
  })
  it('maps entryType to type', () => {
    expect(transformTransaction(makeRaw()).type).toBe('CustomerPayment')
  })
  it('maps date to createdAt as Date', () => {
    expect(transformTransaction(makeRaw()).createdAt).toEqual(new Date('2024-08-01'))
  })
  it('maps voucherNumber to reference', () => {
    expect(transformTransaction(makeRaw()).reference).toBe('42')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTransaction(makeRaw())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
