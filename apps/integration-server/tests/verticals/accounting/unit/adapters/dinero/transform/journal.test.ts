import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import { transformJournal, type DineroJournalEntry } from '../../../../../../../src/verticals/accounting/adapters/dinero/transform/journal'

function makeJournal(overrides: Partial<DineroJournalEntry> = {}): DineroJournalEntry {
  return {
    Guid: 'journal-guid-001',
    Description: 'Monthly salary',
    VoucherNumber: 42,
    EntryDate: '2024-01-31',
    Lines: [
      {
        Guid: 'line-001',
        AccountNumber: 7210,
        Description: 'Gross salary',
        Amount: 50000,
        VatAmount: 0,
      },
      {
        Guid: 'line-002',
        AccountNumber: 1930,
        Description: 'Bank payment',
        Amount: -50000,
        VatAmount: 0,
      },
    ],
    ...overrides,
  }
}

describe('transformJournal', () => {
  it('maps Guid to id', () => {
    expect(transformJournal(makeJournal()).id).toBe('journal-guid-001')
  })

  it('maps Description to description', () => {
    expect(transformJournal(makeJournal()).description).toBe('Monthly salary')
  })

  it('maps VoucherNumber to reference as string', () => {
    expect(transformJournal(makeJournal()).reference).toBe('42')
  })

  it('maps EntryDate to postedAt as Date', () => {
    expect(transformJournal(makeJournal()).postedAt).toEqual(new Date('2024-01-31'))
  })

  it('returns undefined postedAt when EntryDate is empty', () => {
    expect(transformJournal(makeJournal({ EntryDate: '' })).postedAt).toBeUndefined()
  })

  it('maps positive Amount to debitAmount in lineItems', () => {
    const j = transformJournal(makeJournal())
    const debit = j.lineItems![0]
    expect(debit.debitAmount).toBe(50000)
    expect(debit.creditAmount).toBeUndefined()
    expect(debit.accountId).toBe('7210')
  })

  it('maps negative Amount to creditAmount in lineItems', () => {
    const j = transformJournal(makeJournal())
    const credit = j.lineItems![1]
    expect(credit.creditAmount).toBe(50000)
    expect(credit.debitAmount).toBeUndefined()
    expect(credit.accountId).toBe('1930')
  })

  it('maps line Guid to lineitem id', () => {
    const j = transformJournal(makeJournal())
    expect(j.lineItems![0].id).toBe('line-001')
  })

  it('returns undefined description when Description is empty', () => {
    expect(transformJournal(makeJournal({ Description: '' })).description).toBeUndefined()
  })

  it('handles empty Lines array', () => {
    expect(transformJournal(makeJournal({ Lines: [] })).lineItems).toHaveLength(0)
  })

  it('passes raw object as metadata', () => {
    const raw = makeJournal()
    expect(transformJournal(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformJournal(makeJournal())
    expect(() => JournalSchema.parse(result)).not.toThrow()
  })
})
