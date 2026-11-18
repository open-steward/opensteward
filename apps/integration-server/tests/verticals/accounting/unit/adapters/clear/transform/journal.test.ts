import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import {
  transformJournal,
  type ClearJournalEntry,
} from '../../../../../../../src/verticals/accounting/adapters/clear/transform/journal'

function makeRaw(overrides: Partial<ClearJournalEntry> = {}): ClearJournalEntry {
  return {
    id: 'je-uuid-001',
    reference_number: 'JE/2024/001',
    date: '2024-03-01',
    narration: 'Depreciation entry',
    journal_lines: [],
    ...overrides,
  }
}

describe('transformJournal (clear)', () => {
  it('maps core fields correctly', () => {
    const result = transformJournal(makeRaw())
    expect(result.id).toBe('je-uuid-001')
    expect(result.description).toBe('Depreciation entry')
    expect(result.reference).toBe('JE/2024/001')
  })

  it('parses date as Date object', () => {
    const result = transformJournal(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformJournal(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps journal_lines to lineItems', () => {
    const raw = makeRaw({
      journal_lines: [
        {
          id: 'jl-001',
          account_id: 'acc-dep',
          account_name: 'Depreciation',
          debit_amount: 5000,
          credit_amount: 0,
          description: 'Machinery depreciation',
          cost_center: 'Operations',
        },
        {
          id: 'jl-002',
          account_id: 'acc-accum-dep',
          account_name: 'Accumulated Depreciation',
          debit_amount: 0,
          credit_amount: 5000,
          description: 'Accumulated dep',
          cost_center: 'Operations',
        },
      ],
    })
    const result = transformJournal(raw)
    expect(result.lineItems).toHaveLength(2)
    expect(result.lineItems![0].id).toBe('jl-001')
    expect(result.lineItems![0].accountId).toBe('acc-dep')
    expect(result.lineItems![0].debitAmount).toBe(5000)
    expect(result.lineItems![0].creditAmount).toBeUndefined()
    expect(result.lineItems![1].creditAmount).toBe(5000)
    expect(result.lineItems![1].debitAmount).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformJournal(makeRaw())
    expect(() => JournalSchema.parse(result)).not.toThrow()
  })
})
