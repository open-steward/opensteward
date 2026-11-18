import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import { transformJournal, type BlJournalEntry } from '../../../../../../../src/verticals/accounting/adapters/bjornlunden/transform/journal'

function makeJournal(overrides: Partial<BlJournalEntry> = {}): BlJournalEntry {
  return {
    Id: 'journal-uuid-1234',
    Description: 'Monthly salary',
    VoucherNumber: 'V-2024-001',
    EntryDate: '2024-03-15',
    Rows: [],
    ...overrides,
  }
}

describe('transformJournal', () => {
  it('maps id correctly', () => {
    const result = transformJournal(makeJournal())
    expect(result.id).toBe('journal-uuid-1234')
  })

  it('maps description', () => {
    const result = transformJournal(makeJournal())
    expect(result.description).toBe('Monthly salary')
  })

  it('maps voucherNumber to reference', () => {
    const result = transformJournal(makeJournal())
    expect(result.reference).toBe('V-2024-001')
  })

  it('parses entryDate as Date object', () => {
    const result = transformJournal(makeJournal())
    expect(result.postedAt).toEqual(new Date('2024-03-15'))
  })

  it('returns undefined for missing date', () => {
    const result = transformJournal(makeJournal({ EntryDate: '' }))
    expect(result.postedAt).toBeUndefined()
  })

  it('maps journal rows to lineItems', () => {
    const raw = makeJournal({
      Rows: [
        {
          Id: 'row-1',
          AccountNumber: 2610,
          Description: 'Salary expense',
          DebitAmount: 50000,
          CreditAmount: 0,
          ContactId: 'emp-uuid-1',
        },
        {
          Id: 'row-2',
          AccountNumber: 1910,
          Description: 'Cash payment',
          DebitAmount: 0,
          CreditAmount: 50000,
          ContactId: '',
        },
      ],
    })
    const result = transformJournal(raw)
    expect(result.lineItems).toHaveLength(2)
    const li1 = result.lineItems![0]
    expect(li1.id).toBe('row-1')
    expect(li1.accountId).toBe('2610')
    expect(li1.description).toBe('Salary expense')
    expect(li1.debitAmount).toBe(50000)
    expect(li1.creditAmount).toBeUndefined()
    expect(li1.contactId).toBe('emp-uuid-1')

    const li2 = result.lineItems![1]
    expect(li2.debitAmount).toBeUndefined()
    expect(li2.creditAmount).toBe(50000)
    expect(li2.contactId).toBeUndefined()
  })

  it('returns undefined for empty string fields', () => {
    const result = transformJournal(makeJournal({ Description: '', VoucherNumber: '' }))
    expect(result.description).toBeUndefined()
    expect(result.reference).toBeUndefined()
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeJournal()
    const result = transformJournal(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformJournal(makeJournal())
    expect(() => JournalSchema.parse(result)).not.toThrow()
  })
})
