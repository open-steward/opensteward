import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import {
  transformJournal,
  type ZohoBooksJournalEntry,
  type ZohoBooksJournalLine,
} from '../../../../../../../src/verticals/accounting/adapters/zohobooks/transform/journal'

function makeJournalLine(overrides: Partial<ZohoBooksJournalLine> = {}): ZohoBooksJournalLine {
  return {
    line_item_id: 'jl-1',
    account_id: 'acct-100',
    account_name: 'Cash',
    debit_or_credit: 'debit',
    amount: 1000,
    description: 'Cash receipt',
    ...overrides,
  }
}

function makeJournalEntry(overrides: Partial<ZohoBooksJournalEntry> = {}): ZohoBooksJournalEntry {
  return {
    journal_id: 'jnl-001',
    journal_date: '2024-06-15',
    reference_number: 'JE-2024-100',
    notes: 'Monthly adjusting entry',
    line_items: [makeJournalLine()],
    ...overrides,
  }
}

describe('transformJournal', () => {
  it('maps journal_id to id', () => {
    expect(transformJournal(makeJournalEntry()).id).toBe('jnl-001')
  })

  it('maps notes to description', () => {
    expect(transformJournal(makeJournalEntry()).description).toBe('Monthly adjusting entry')
  })

  it('maps reference_number to reference', () => {
    expect(transformJournal(makeJournalEntry()).reference).toBe('JE-2024-100')
  })

  it('parses journal_date as postedAt Date object', () => {
    expect(transformJournal(makeJournalEntry()).postedAt).toEqual(new Date('2024-06-15'))
  })

  it('maps debit line to debitAmount', () => {
    const result = transformJournal(makeJournalEntry({ line_items: [makeJournalLine({ debit_or_credit: 'debit', amount: 1000 })] }))
    if (result.lineItems == null) throw new Error('expected lineItems to be defined')
    expect(result.lineItems[0].debitAmount).toBe(1000)
    expect(result.lineItems[0].creditAmount).toBeUndefined()
  })

  it('maps credit line to creditAmount', () => {
    const result = transformJournal(makeJournalEntry({ line_items: [makeJournalLine({ debit_or_credit: 'credit', amount: 1000 })] }))
    if (result.lineItems == null) throw new Error('expected lineItems to be defined')
    expect(result.lineItems[0].creditAmount).toBe(1000)
    expect(result.lineItems[0].debitAmount).toBeUndefined()
  })

  it('maps line account_id to lineitem accountId', () => {
    const result = transformJournal(makeJournalEntry())
    expect(result.lineItems?.[0].accountId).toBe('acct-100')
  })

  it('maps line description to lineitem description', () => {
    const result = transformJournal(makeJournalEntry())
    expect(result.lineItems?.[0].description).toBe('Cash receipt')
  })

  it('produces correct number of lineItems', () => {
    const entry = makeJournalEntry({
      line_items: [
        makeJournalLine({ debit_or_credit: 'debit' }),
        makeJournalLine({ debit_or_credit: 'credit', line_item_id: 'jl-2' }),
      ],
    })
    expect(transformJournal(entry).lineItems).toHaveLength(2)
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeJournalEntry()
    expect(transformJournal(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformJournal(makeJournalEntry())
    expect(() => JournalSchema.parse(result)).not.toThrow()
  })
})
