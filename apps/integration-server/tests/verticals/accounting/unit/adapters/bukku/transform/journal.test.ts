import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import { transformJournal, type BukkuJournal } from '../../../../../../../src/verticals/accounting/adapters/bukku/transform/journal'

function makeRaw(overrides: Partial<BukkuJournal> = {}): BukkuJournal {
  return {
    id: '15',
    number: 'JNL-001',
    date: '2024-01-31',
    description: 'Monthly accruals',
    reference: 'ACC-2024-01',
    journal_lines: [],
    ...overrides,
  }
}

describe('transformJournal (bukku)', () => {
  it('maps core fields correctly', () => {
    const result = transformJournal(makeRaw())
    expect(result.id).toBe('15')
    expect(result.description).toBe('Monthly accruals')
    expect(result.reference).toBe('ACC-2024-01')
  })

  it('parses date as Date object', () => {
    const result = transformJournal(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-01-31'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw({ number: 'JNL-999' })
    const result = transformJournal(raw)
    expect(result.metadata).toBe(raw)
    expect((result.metadata as Record<string, unknown>)['number']).toBe('JNL-999')
  })

  it('maps journal lines to lineItems', () => {
    const raw = makeRaw({
      journal_lines: [
        {
          id: '1',
          account_id: '100',
          account_code: '1-001',
          account_name: 'Cash',
          description: 'Cash receipt',
          debit_amount: 1000,
          credit_amount: 0,
        },
        {
          id: '2',
          account_id: '400',
          account_code: '4-001',
          account_name: 'Revenue',
          description: 'Sales revenue',
          debit_amount: 0,
          credit_amount: 1000,
        },
      ],
    })
    const result = transformJournal(raw)
    expect(result.lineItems).toHaveLength(2)
    expect(result.lineItems![0].accountId).toBe('100')
    expect(result.lineItems![0].debitAmount).toBe(1000)
    expect(result.lineItems![1].accountId).toBe('400')
    expect(result.lineItems![1].creditAmount).toBe(1000)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformJournal(makeRaw())
    expect(() => JournalSchema.parse(result)).not.toThrow()
  })
})
