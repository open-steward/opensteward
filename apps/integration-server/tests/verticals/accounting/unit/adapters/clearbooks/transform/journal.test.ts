import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import { transformJournal, type ClearBooksJournal } from '../../../../../../../src/verticals/accounting/adapters/clearbooks/transform/journal'

function makeJournal(overrides: Partial<ClearBooksJournal> = {}): ClearBooksJournal {
  return {
    journal_id: '501',
    date: '15/06/2024',
    description: 'Monthly accrual',
    lines: [],
    ...overrides,
  }
}

describe('transformJournal (ClearBooks)', () => {
  it('maps core fields correctly', () => {
    const result = transformJournal(makeJournal())
    expect(result.id).toBe('501')
    expect(result.description).toBe('Monthly accrual')
  })

  it('parses UK date format DD/MM/YYYY', () => {
    const result = transformJournal(makeJournal())
    expect(result.postedAt).toEqual(new Date('2024-06-15'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeJournal()
    const result = transformJournal(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps journal lines to lineItems', () => {
    const raw = makeJournal({
      lines: [
        {
          id: 1,
          account_code: '1000',
          description: 'Cash debit',
          debit: 500,
          credit: 0,
        },
        {
          id: 2,
          account_code: '4000',
          description: 'Revenue credit',
          debit: 0,
          credit: 500,
        },
      ],
    })
    const result = transformJournal(raw)
    expect(result.lineItems).toHaveLength(2)
    expect(result.lineItems![0].id).toBe('1')
    expect(result.lineItems![0].accountId).toBe('1000')
    expect(result.lineItems![0].debitAmount).toBe(500)
    expect(result.lineItems![1].creditAmount).toBe(500)
  })

  it('returns empty lineItems when lines is empty', () => {
    const result = transformJournal(makeJournal({ lines: [] }))
    expect(result.lineItems).toEqual([])
  })

  it('converts numeric journal_id to string', () => {
    const result = transformJournal(makeJournal({ journal_id: 9 }))
    expect(result.id).toBe('9')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformJournal(makeJournal())
    expect(() => JournalSchema.parse(result)).not.toThrow()
  })
})
