import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import { transformJournal, type BCJournalEntry } from '../../../../../../../src/verticals/accounting/adapters/dynamics365bc/transform/journal'

function makeJournal(overrides: Partial<BCJournalEntry> = {}): BCJournalEntry {
  return {
    id: 'journal-1',
    code: 'GENERAL',
    displayName: 'General Journal',
    journalLines: [
      {
        id: 'line-1',
        journalDisplayName: 'General Journal',
        lineNumber: 10000,
        accountType: 'G/L Account',
        accountId: 'acct-1',
        postingDate: '2024-03-01',
        description: 'Office supplies',
        debitAmount: 500,
        creditAmount: 0,
        amount: 500,
      },
    ],
    ...overrides,
  }
}

describe('transformJournal (dynamics365bc)', () => {
  it('maps id and reference', () => {
    const result = transformJournal(makeJournal())
    expect(result.id).toBe('journal-1')
    expect(result.reference).toBe('GENERAL')
  })

  it('maps description from displayName', () => {
    expect(transformJournal(makeJournal()).description).toBe('General Journal')
  })

  it('maps lineItems', () => {
    const result = transformJournal(makeJournal())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems?.[0]?.id).toBe('line-1')
    expect(result.lineItems?.[0]?.debitAmount).toBe(500)
  })

  it('maps postedAt from first line postingDate', () => {
    const result = transformJournal(makeJournal())
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
  })

  it('handles no journal lines', () => {
    const result = transformJournal(makeJournal({ journalLines: [] }))
    expect(result.lineItems).toHaveLength(0)
    expect(result.postedAt).toBeUndefined()
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
