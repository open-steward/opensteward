import { describe, it, expect } from 'vitest'
import {
  transformJournal,
  untransformJournal,
  type ManagerJournalEntry,
} from '../../../../../../../src/verticals/accounting/adapters/manager/transform/journal'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'

function makeJournal(overrides: Partial<ManagerJournalEntry> = {}): ManagerJournalEntry {
  return {
    key: 'je-key-1',
    date: '2024-10-31',
    reference: 'JE-2024-001',
    narration: 'Year-end accrual',
    lines: [
      {
        account: 'acct-A',
        debit: { value: 500.0, currency: 'USD' },
        credit: { value: 0, currency: 'USD' },
        description: 'Accrued expense',
      },
      {
        account: 'acct-B',
        debit: { value: 0, currency: 'USD' },
        credit: { value: 500.0, currency: 'USD' },
        description: 'Accruals payable',
      },
    ],
    ...overrides,
  }
}

describe('transformJournal', () => {
  it('maps key to id', () => {
    expect(transformJournal(makeJournal()).id).toBe('je-key-1')
  })

  it('maps narration to description', () => {
    expect(transformJournal(makeJournal()).description).toBe('Year-end accrual')
  })

  it('maps reference', () => {
    expect(transformJournal(makeJournal()).reference).toBe('JE-2024-001')
  })

  it('parses date as postedAt', () => {
    expect(transformJournal(makeJournal()).postedAt).toEqual(new Date('2024-10-31'))
  })

  it('maps lines to lineItems with debit/credit values', () => {
    const result = transformJournal(makeJournal())
    expect(result.lineItems).toHaveLength(2)
    expect(result.lineItems![0].accountId).toBe('acct-A')
    // debit.value=500.0 → toMinorUnits → 50000
    expect(result.lineItems![0].debitAmount).toBe(50000)
    expect(result.lineItems![0].description).toBe('Accrued expense')
    expect(result.lineItems![1].creditAmount).toBe(50000)
  })

  it('passes schema validation', () => {
    expect(() => JournalSchema.parse(transformJournal(makeJournal()))).not.toThrow()
  })

  it('round-trips through untransformJournal', () => {
    const canonical = transformJournal(makeJournal())
    const wire = untransformJournal(canonical)
    expect(wire.reference).toBe('JE-2024-001')
    expect(wire.narration).toBe('Year-end accrual')
    // untransformJournal returns ISO date string (postedAt.toISOString().split('T')[0])
    expect(wire.date).toBe('2024-10-31')
  })
})
