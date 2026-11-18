import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import { transformJournal, type MekariJurnalJournal } from '../../../../../../../src/verticals/accounting/adapters/mekarijurnal/transform/journal'

function makeJournal(overrides: Partial<MekariJurnalJournal> = {}): MekariJurnalJournal {
  return {
    id: 500,
    date: '2024-06-01',
    memo: 'Monthly adjustment',
    lines: [
      { id: 1, account_id: 1001, debit: 1000000, credit: 0 },
      { id: 2, account_id: 2001, debit: 0, credit: 1000000 },
    ],
    ...overrides,
  }
}

describe('transformJournal (mekarijurnal)', () => {
  it('maps core fields correctly', () => {
    const result = transformJournal(makeJournal())
    expect(result.id).toBe('500')
    expect(result.description).toBe('Monthly adjustment')
  })

  it('parses date as Date object', () => {
    const result = transformJournal(makeJournal())
    expect(result.postedAt).toEqual(new Date('2024-06-01'))
  })

  it('maps journal lines correctly', () => {
    const result = transformJournal(makeJournal())
    expect(result.lineItems).toHaveLength(2)
    expect(result.lineItems![0].accountId).toBe('1001')
    expect(result.lineItems![0].debitAmount).toBe(1000000)
    expect(result.lineItems![0].creditAmount).toBe(0)
    expect(result.lineItems![1].accountId).toBe('2001')
    expect(result.lineItems![1].creditAmount).toBe(1000000)
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeJournal()
    const result = transformJournal(raw)
    expect(result.metadata).toBe(raw)
  })

  it('handles null memo', () => {
    const result = transformJournal(makeJournal({ memo: null }))
    expect(result.description).toBeUndefined()
  })

  it('handles empty lines array', () => {
    const result = transformJournal(makeJournal({ lines: [] }))
    expect(result.lineItems).toHaveLength(0)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformJournal(makeJournal())
    expect(() => JournalSchema.parse(result)).not.toThrow()
  })
})
