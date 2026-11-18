import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import {
  transformTransaction,
  type ClearLedgerEntry,
} from '../../../../../../../src/verticals/accounting/adapters/clear/transform/transaction'

function makeRaw(overrides: Partial<ClearLedgerEntry> = {}): ClearLedgerEntry {
  return {
    id: 'le-uuid-001',
    date: '2024-03-10',
    amount: 11800,
    transaction_type: 'credit',
    description: 'Customer payment',
    account_id: 'acc-bank-001',
    contact_id: 'contact-uuid-001',
    reference: 'INV/2024/001',
    ...overrides,
  }
}

describe('transformTransaction (clear)', () => {
  it('maps core fields correctly', () => {
    const result = transformTransaction(makeRaw())
    expect(result.id).toBe('le-uuid-001')
    expect(result.accountId).toBe('acc-bank-001')
    expect(result.type).toBe('credit')
    expect(result.reference).toBe('INV/2024/001')
    expect(result.memo).toBe('Customer payment')
    expect(result.totalAmount).toBe(11800)
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

  it('maps debit transaction type', () => {
    const result = transformTransaction(makeRaw({ transaction_type: 'debit' }))
    expect(result.type).toBe('debit')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTransaction(makeRaw())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
