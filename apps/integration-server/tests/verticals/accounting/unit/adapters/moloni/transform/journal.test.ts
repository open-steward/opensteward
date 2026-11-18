import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import { transformJournal, type MoloniJournal } from '../../../../../../../src/verticals/accounting/adapters/moloni/transform/journal'

function makeJournal(overrides: Partial<MoloniJournal> = {}): MoloniJournal {
  return {
    journal_entry_id: 5,
    date: '2024-03-01',
    description: 'Monthly closing',
    lines: [],
    ...overrides,
  }
}

describe('transformJournal', () => {
  it('maps core fields correctly', () => {
    const result = transformJournal(makeJournal())
    expect(result.id).toBe('5')
    expect(result.description).toBe('Monthly closing')
  })

  it('parses date as Date object', () => {
    const result = transformJournal(makeJournal())
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeJournal({ description: 'Test entry' })
    const result = transformJournal(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps journal lines to lineItems', () => {
    const raw = makeJournal({
      lines: [
        { account_id: 100, description: 'Revenue', debit: 0, credit: 500 },
        { account_id: 200, description: 'Cash', debit: 500, credit: 0 },
      ],
    })
    const result = transformJournal(raw)
    expect(result.lineItems).toHaveLength(2)
    expect(result.lineItems![0].accountId).toBe('100')
    expect(result.lineItems![0].description).toBe('Revenue')
    expect(result.lineItems![0].creditAmount).toBe(500)
    expect(result.lineItems![1].debitAmount).toBe(500)
  })

  it('returns undefined postedAt when date is empty', () => {
    const result = transformJournal(makeJournal({ date: '' }))
    expect(result.postedAt).toBeUndefined()
  })

  it('maps empty lines array to empty lineItems', () => {
    const result = transformJournal(makeJournal({ lines: [] }))
    expect(result.lineItems).toHaveLength(0)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformJournal(makeJournal())
    expect(() => JournalSchema.parse(result)).not.toThrow()
  })
})
