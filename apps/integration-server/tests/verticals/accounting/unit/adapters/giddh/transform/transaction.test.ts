import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import {
  transformTransaction,
  type GiddhLedgerEntry,
} from '../../../../../../../src/verticals/accounting/adapters/giddh/transform/transaction'

function makeRaw(overrides: Partial<GiddhLedgerEntry> = {}): GiddhLedgerEntry {
  return {
    uniqueName: 'ledger-entry-001',
    entryDate: '2024-03-10',
    particular: 'Cash In Hand',
    debit: 50000,
    credit: 0,
    balance: 50000,
    description: 'Cash received from customer',
    ...overrides,
  }
}

describe('transformTransaction (giddh)', () => {
  it('maps core fields correctly', () => {
    const result = transformTransaction(makeRaw())
    expect(result.id).toBe('ledger-entry-001')
    expect(result.memo).toBe('Cash received from customer')
    expect(result.totalAmount).toBe(50000)
    expect(result.type).toBe('DEBIT')
  })

  it('parses entryDate as Date object', () => {
    const result = transformTransaction(makeRaw())
    expect(result.createdAt).toEqual(new Date('2024-03-10'))
  })

  it('maps credit entry as CREDIT type with negative amount', () => {
    const result = transformTransaction(makeRaw({ debit: 0, credit: 30000 }))
    expect(result.type).toBe('CREDIT')
    expect(result.totalAmount).toBe(-30000)
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
