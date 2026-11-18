import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import { transformJournal, type FinancioJournal } from '../../../../../../../src/verticals/accounting/adapters/financio/transform/journal'

function makeRaw(overrides: Partial<FinancioJournal> = {}): FinancioJournal {
  return {
    id: '600',
    reference: 'JE-001',
    date: '2024-01-31',
    description: 'Year-end accrual',
    entries: [],
    ...overrides,
  }
}

describe('transformJournal (financio)', () => {
  it('maps core fields correctly', () => {
    const result = transformJournal(makeRaw())
    expect(result.id).toBe('600')
    expect(result.description).toBe('Year-end accrual')
    expect(result.reference).toBe('JE-001')
  })

  it('parses date as Date object', () => {
    const result = transformJournal(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-01-31'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw({ reference: 'JE-SPECIAL' })
    const result = transformJournal(raw)
    expect(result.metadata).toBe(raw)
    expect((result.metadata as Record<string, unknown>)['reference']).toBe('JE-SPECIAL')
  })

  it('maps entries to lineItems', () => {
    const raw = makeRaw({
      entries: [
        {
          id: '1',
          account_code: '1-001',
          account_name: 'Cash',
          debit: 1000,
          credit: 0,
          description: 'Cash received',
        },
        {
          id: '2',
          account_code: '4-001',
          account_name: 'Revenue',
          debit: 0,
          credit: 1000,
          description: 'Sales',
        },
      ],
    })
    const result = transformJournal(raw)
    expect(result.lineItems).toHaveLength(2)
    expect(result.lineItems![0].debitAmount).toBe(1000)
    expect(result.lineItems![1].creditAmount).toBe(1000)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformJournal(makeRaw())
    expect(() => JournalSchema.parse(result)).not.toThrow()
  })
})
