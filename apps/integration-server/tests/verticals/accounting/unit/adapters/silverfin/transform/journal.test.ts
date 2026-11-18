import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import { transformJournal, type SilverfinJournal } from '../../../../../../../src/verticals/accounting/adapters/silverfin/transform/journal'

function makeJournal(overrides: Partial<SilverfinJournal> = {}): SilverfinJournal {
  return {
    id: '500',
    period: '2024-03-01',
    description: 'Monthly accruals',
    lines: [],
    ...overrides,
  }
}

describe('transformJournal (Silverfin)', () => {
  it('maps core fields correctly', () => {
    const result = transformJournal(makeJournal())
    expect(result.id).toBe('500')
    expect(result.description).toBe('Monthly accruals')
  })

  it('parses period as postedAt Date', () => {
    const result = transformJournal(makeJournal())
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
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
          account_number: '5500',
          description: 'Cash debit',
          debit: 1000,
          credit: 0,
        },
        {
          id: 2,
          account_number: '4000',
          description: 'Revenue credit',
          debit: 0,
          credit: 1000,
        },
      ],
    })
    const result = transformJournal(raw)
    expect(result.lineItems).toHaveLength(2)
    expect(result.lineItems![0].id).toBe('1')
    expect(result.lineItems![0].accountId).toBe('5500')
    expect(result.lineItems![0].debitAmount).toBe(1000)
    expect(result.lineItems![1].creditAmount).toBe(1000)
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
