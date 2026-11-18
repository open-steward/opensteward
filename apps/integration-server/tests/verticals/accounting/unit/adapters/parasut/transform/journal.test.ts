import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import { transformJournal, type ParasutJournal } from '../../../../../../../src/verticals/accounting/adapters/parasut/transform/journal'

function makeJournal(overrides: Partial<ParasutJournal> = {}): ParasutJournal {
  return {
    id: 'jnl_1',
    type: 'ledger_entries',
    attributes: {
      description: 'Monthly closing entry',
      date: '2024-01-31',
      reference: 'JNL-2024-001',
      lines: [
        { id: 'line_1', account_id: '1000', debit: 5000, credit: 0, description: 'Cash' },
        { id: 'line_2', account_id: '4000', debit: 0, credit: 5000, description: 'Revenue' },
      ],
    },
    ...overrides,
  }
}

describe('transformJournal (parasut)', () => {
  it('maps id correctly', () => {
    expect(transformJournal(makeJournal()).id).toBe('jnl_1')
  })

  it('maps description and reference', () => {
    const j = transformJournal(makeJournal())
    expect(j.description).toBe('Monthly closing entry')
    expect(j.reference).toBe('JNL-2024-001')
  })

  it('parses date as Date object', () => {
    expect(transformJournal(makeJournal()).postedAt).toEqual(new Date('2024-01-31'))
  })

  it('maps journal lines to lineItems', () => {
    const j = transformJournal(makeJournal())
    expect(j.lineItems).toHaveLength(2)
    expect(j.lineItems?.[0].id).toBe('line_1')
    expect(j.lineItems?.[0].accountId).toBe('1000')
    expect(j.lineItems?.[0].debitAmount).toBe(5000)
    expect(j.lineItems?.[0].creditAmount).toBe(0)
    expect(j.lineItems?.[1].creditAmount).toBe(5000)
  })

  it('passes raw object as metadata', () => {
    const raw = makeJournal()
    expect(transformJournal(raw).metadata).toBe(raw)
  })

  it('handles missing lines gracefully', () => {
    const raw = makeJournal({ attributes: { description: 'Test', date: '2024-01-01' } })
    const j = transformJournal(raw)
    expect(j.lineItems).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformJournal(makeJournal())
    expect(() => JournalSchema.parse(result)).not.toThrow()
  })
})
