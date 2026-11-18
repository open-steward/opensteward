import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import { transformJournal, type PeakAccountJournal } from '../../../../../../../src/verticals/accounting/adapters/peakaccount/transform/journal'

function makeJournal(overrides: Partial<PeakAccountJournal> = {}): PeakAccountJournal {
  return {
    id: 'JV-001',
    date: '2024-01-31',
    description: 'Monthly closing entry',
    entries: [],
    ...overrides,
  }
}

describe('transformJournal', () => {
  it('maps core fields correctly', () => {
    const result = transformJournal(makeJournal())
    expect(result.id).toBe('JV-001')
    expect(result.description).toBe('Monthly closing entry')
  })

  it('parses date as Date object', () => {
    const result = transformJournal(makeJournal())
    expect(result.postedAt).toEqual(new Date('2024-01-31'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeJournal()
    const result = transformJournal(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps journal entries to lineItems', () => {
    const raw = makeJournal({
      entries: [
        {
          id: 'E-1',
          accountCode: '1100',
          debit: 10000,
          credit: 0,
          description: 'Cash debit',
        },
        {
          id: 'E-2',
          accountCode: '4000',
          debit: 0,
          credit: 10000,
          description: 'Revenue credit',
        },
      ],
    })
    const result = transformJournal(raw)
    expect(result.lineItems).toHaveLength(2)
    expect(result.lineItems![0].id).toBe('E-1')
    expect(result.lineItems![0].accountId).toBe('1100')
    expect(result.lineItems![0].debitAmount).toBe(10000)
    expect(result.lineItems![1].creditAmount).toBe(10000)
  })

  it('handles empty entries', () => {
    const result = transformJournal(makeJournal({ entries: [] }))
    expect(result.lineItems).toHaveLength(0)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformJournal(makeJournal())
    expect(() => JournalSchema.parse(result)).not.toThrow()
  })
})
