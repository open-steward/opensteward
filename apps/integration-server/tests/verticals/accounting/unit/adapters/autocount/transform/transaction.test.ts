import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import {
  transformTransaction,
  type AutocountTransaction,
} from '../../../../../../../src/verticals/accounting/adapters/autocount/transform/transaction'

function makeRaw(overrides: Partial<AutocountTransaction> = {}): AutocountTransaction {
  return {
    DocNo: 'TXN-001',
    DocDate: '2024-03-10',
    AccNo: '100-000',
    Description: 'Customer payment received',
    DrAmt: 0,
    CrAmt: 1060,
    Balance: 5000,
    DocType: 'OR',
    ...overrides,
  }
}

describe('transformTransaction (autocount)', () => {
  it('maps core fields correctly', () => {
    const result = transformTransaction(makeRaw())
    expect(result.id).toBe('TXN-001')
    expect(result.accountId).toBe('100-000')
    expect(result.memo).toBe('Customer payment received')
    expect(result.type).toBe('OR')
  })

  it('uses CrAmt as totalAmount for credit transactions', () => {
    const result = transformTransaction(makeRaw({ DrAmt: 0, CrAmt: 1060 }))
    expect(result.totalAmount).toBe(1060)
  })

  it('uses DrAmt as totalAmount for debit transactions', () => {
    const result = transformTransaction(makeRaw({ DrAmt: 500, CrAmt: 0 }))
    expect(result.totalAmount).toBe(500)
  })

  it('parses date as Date object', () => {
    const result = transformTransaction(makeRaw())
    expect(result.createdAt).toEqual(new Date('2024-03-10'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformTransaction(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTransaction(makeRaw())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
