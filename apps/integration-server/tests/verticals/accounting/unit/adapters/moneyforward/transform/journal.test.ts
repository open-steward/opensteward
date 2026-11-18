import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import { transformJournal, type MoneyForwardJournalEntry } from '../../../../../../../src/verticals/accounting/adapters/moneyforward/transform/journal'

function makeRaw(overrides: Partial<MoneyForwardJournalEntry> = {}): MoneyForwardJournalEntry {
  return {
    id: 'je-001',
    journal_entry_date: '2024-05-15',
    description: 'Monthly accrual',
    memo: 'May 2024',
    journal_entry_details: [],
    ...overrides,
  }
}

describe('transformJournal (moneyforward)', () => {
  it('maps core fields correctly', () => {
    const result = transformJournal(makeRaw())
    expect(result.id).toBe('je-001')
    expect(result.description).toBe('Monthly accrual')
  })

  it('falls back to memo when description is null', () => {
    const result = transformJournal(makeRaw({ description: null }))
    expect(result.description).toBe('May 2024')
  })

  it('parses journal_entry_date as Date object', () => {
    const result = transformJournal(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-05-15'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformJournal(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps journal_entry_details to lineItems', () => {
    const raw = makeRaw({
      journal_entry_details: [
        {
          id: 'jed-1',
          account_item_id: 'acct-100',
          account_item_name: 'Cash',
          debit_amount: 5000,
          credit_amount: 0,
          description: 'Cash in',
        },
        {
          id: 'jed-2',
          account_item_id: 'acct-200',
          account_item_name: 'Revenue',
          debit_amount: 0,
          credit_amount: 5000,
          description: 'Revenue recognized',
        },
      ],
    })
    const result = transformJournal(raw)
    expect(result.lineItems).toHaveLength(2)
    expect(result.lineItems![0].accountId).toBe('acct-100')
    expect(result.lineItems![0].debitAmount).toBe(5000)
    expect(result.lineItems![0].creditAmount).toBeUndefined()
    expect(result.lineItems![1].accountId).toBe('acct-200')
    expect(result.lineItems![1].creditAmount).toBe(5000)
    expect(result.lineItems![1].debitAmount).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformJournal(makeRaw())
    expect(() => JournalSchema.parse(result)).not.toThrow()
  })
})
