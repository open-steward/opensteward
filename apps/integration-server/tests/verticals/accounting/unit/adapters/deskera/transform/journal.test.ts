import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import {
  transformJournal,
  type DeskeraJournal,
} from '../../../../../../../src/verticals/accounting/adapters/deskera/transform/journal'

function makeRaw(overrides: Partial<DeskeraJournal> = {}): DeskeraJournal {
  return {
    id: 'JE-001',
    entryNumber: 'JE-2024-001',
    journalDate: '2024-01-15',
    memo: 'Monthly accruals',
    lineItems: [],
    ...overrides,
  }
}

describe('transformJournal (Deskera)', () => {
  it('maps core fields correctly', () => {
    const result = transformJournal(makeRaw())
    expect(result.id).toBe('JE-001')
    expect(result.description).toBe('Monthly accruals')
    expect(result.reference).toBe('JE-2024-001')
  })

  it('parses date as Date object', () => {
    const result = transformJournal(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-01-15'))
  })

  it('maps line items', () => {
    const raw = makeRaw({
      lineItems: [
        {
          id: 'li-1',
          accountCode: 'ACC-1000',
          accountName: 'Cash',
          description: 'Debit cash',
          debit: 5000,
          credit: 0,
        },
        {
          id: 'li-2',
          accountCode: 'ACC-2000',
          accountName: 'Revenue',
          description: 'Credit revenue',
          debit: 0,
          credit: 5000,
        },
      ],
    })
    const result = transformJournal(raw)
    expect(result.lineItems).toHaveLength(2)
    expect(result.lineItems![0].accountId).toBe('ACC-1000')
    expect(result.lineItems![0].debitAmount).toBe(5000)
    expect(result.lineItems![0].creditAmount).toBeUndefined()
    expect(result.lineItems![1].accountId).toBe('ACC-2000')
    expect(result.lineItems![1].creditAmount).toBe(5000)
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformJournal(raw)
    expect(result.metadata).toBe(raw)
  })

  it('handles missing dates gracefully', () => {
    const result = transformJournal(makeRaw({ journalDate: undefined }))
    expect(result.postedAt).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformJournal(makeRaw())
    expect(() => JournalSchema.parse(result)).not.toThrow()
  })
})
