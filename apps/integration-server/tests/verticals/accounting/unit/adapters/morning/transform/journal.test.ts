import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import { transformJournal, type MorningJournal } from '../../../../../../../src/verticals/accounting/adapters/morning/transform/journal'

function makeJournal(overrides: Partial<MorningJournal> = {}): MorningJournal {
  return {
    id: 'jnl_1',
    date: '2024-03-01',
    description: 'Monthly journal entry',
    currency: 'ILS',
    lines: [
      { accountId: 'acc_100', debit: 1000, credit: 0, description: 'Debit entry' },
      { accountId: 'acc_200', debit: 0, credit: 1000, description: 'Credit entry' },
    ],
    ...overrides,
  }
}

describe('transformJournal (morning)', () => {
  it('maps core fields correctly', () => {
    const result = transformJournal(makeJournal())
    expect(result.id).toBe('jnl_1')
    expect(result.description).toBe('Monthly journal entry')
    expect(result.currency).toBe('ILS')
  })

  it('parses date as Date object', () => {
    const result = transformJournal(makeJournal())
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
  })

  it('maps journal lines correctly', () => {
    const result = transformJournal(makeJournal())
    expect(result.lineItems).toHaveLength(2)
    expect(result.lineItems![0].accountId).toBe('acc_100')
    expect(result.lineItems![0].debitAmount).toBe(1000)
    expect(result.lineItems![1].accountId).toBe('acc_200')
    expect(result.lineItems![1].creditAmount).toBe(1000)
  })

  it('handles empty lines', () => {
    const result = transformJournal(makeJournal({ lines: [] }))
    expect(result.lineItems).toHaveLength(0)
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeJournal()
    const result = transformJournal(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformJournal(makeJournal())
    expect(() => JournalSchema.parse(result)).not.toThrow()
  })
})
