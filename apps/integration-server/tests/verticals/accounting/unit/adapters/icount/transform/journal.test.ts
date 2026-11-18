import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import { transformJournal, type ICountJournal } from '../../../../../../../src/verticals/accounting/adapters/icount/transform/journal'

function makeJournal(overrides: Partial<ICountJournal> = {}): ICountJournal {
  return {
    doc_id: 'jnl_5',
    date: '2024-03-01',
    description: 'Quarterly closing entry',
    currency_code: 'ILS',
    lines: [
      { account_id: 'acc_300', debit: 2000, credit: 0, description: 'Revenue account' },
      { account_id: 'acc_400', debit: 0, credit: 2000, description: 'Cash account' },
    ],
    ...overrides,
  }
}

describe('transformJournal (icount)', () => {
  it('maps core fields correctly', () => {
    const result = transformJournal(makeJournal())
    expect(result.id).toBe('jnl_5')
    expect(result.description).toBe('Quarterly closing entry')
    expect(result.currency).toBe('ILS')
  })

  it('parses date as Date object', () => {
    const result = transformJournal(makeJournal())
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
  })

  it('maps journal lines correctly', () => {
    const result = transformJournal(makeJournal())
    expect(result.lineItems).toHaveLength(2)
    expect(result.lineItems![0].accountId).toBe('acc_300')
    expect(result.lineItems![0].debitAmount).toBe(2000)
    expect(result.lineItems![1].accountId).toBe('acc_400')
    expect(result.lineItems![1].creditAmount).toBe(2000)
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
