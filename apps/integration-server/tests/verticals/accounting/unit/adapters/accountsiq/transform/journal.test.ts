import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import { transformJournal, type AccountsIQJournal } from '../../../../../../../src/verticals/accounting/adapters/accountsiq/transform/journal'

function makeJournal(overrides: Partial<AccountsIQJournal> = {}): AccountsIQJournal {
  return {
    journalId: '300',
    entityId: '10',
    journalDate: '2024-03-31',
    description: 'Month-end journal',
    lines: [],
    ...overrides,
  }
}

describe('transformJournal (AccountsIQ)', () => {
  it('maps core fields correctly', () => {
    const result = transformJournal(makeJournal())
    expect(result.id).toBe('300')
    expect(result.description).toBe('Month-end journal')
  })

  it('parses journalDate as postedAt Date', () => {
    const result = transformJournal(makeJournal())
    expect(result.postedAt).toEqual(new Date('2024-03-31'))
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
          lineId: 1,
          accountCode: '1000',
          description: 'Debit entry',
          debitAmount: 5000,
          creditAmount: 0,
        },
        {
          lineId: 2,
          accountCode: '4000',
          description: 'Credit entry',
          debitAmount: 0,
          creditAmount: 5000,
        },
      ],
    })
    const result = transformJournal(raw)
    expect(result.lineItems).toHaveLength(2)
    expect(result.lineItems![0].id).toBe('1')
    expect(result.lineItems![0].accountId).toBe('1000')
    expect(result.lineItems![0].debitAmount).toBe(5000)
    expect(result.lineItems![1].creditAmount).toBe(5000)
  })

  it('returns empty lineItems array when lines is absent', () => {
    const result = transformJournal(makeJournal({ lines: [] }))
    expect(result.lineItems).toEqual([])
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformJournal(makeJournal())
    expect(() => JournalSchema.parse(result)).not.toThrow()
  })
})
