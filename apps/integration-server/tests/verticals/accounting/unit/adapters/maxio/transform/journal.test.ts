import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import { transformJournal, type MaxioJournalEntry } from '../../../../../../../src/verticals/accounting/adapters/maxio/transform/journal'

function makeJournal(overrides: Partial<MaxioJournalEntry> = {}): MaxioJournalEntry {
  return {
    id: 'je_001',
    memo: 'Revenue recognition',
    transaction_date: '2024-03-31',
    entries: [],
    ...overrides,
  }
}

describe('transformJournal (Maxio)', () => {
  it('maps id as string', () => {
    expect(transformJournal(makeJournal()).id).toBe('je_001')
  })

  it('maps description from memo', () => {
    expect(transformJournal(makeJournal()).description).toBe('Revenue recognition')
  })

  it('parses transaction_date as Date', () => {
    expect(transformJournal(makeJournal()).postedAt).toEqual(new Date('2024-03-31'))
  })

  it('passes raw object as metadata', () => {
    const raw = makeJournal()
    expect(transformJournal(raw).metadata).toBe(raw)
  })

  it('maps entries to lineItems with cents conversion', () => {
    const raw = makeJournal({
      entries: [
        {
          id: 10,
          account_id: 'ACC-1000',
          description: 'Debit cash',
          debit_amount_in_cents: 100000,
          credit_amount_in_cents: 0,
        },
      ],
    })
    const result = transformJournal(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].accountId).toBe('ACC-1000')
    expect(result.lineItems![0].debitAmount).toBe(1000)
  })

  it('returns empty lineItems when entries is empty', () => {
    expect(transformJournal(makeJournal({ entries: [] })).lineItems).toEqual([])
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformJournal(makeJournal())
    expect(() => JournalSchema.parse(result)).not.toThrow()
  })
})
