import { describe, it, expect } from 'vitest'
import {
  transformJournal,
  type KlaraJournalEntry,
} from '../../../../../../../src/verticals/accounting/adapters/klara/transform/journal'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'

function makeJournal(overrides: Partial<KlaraJournalEntry> = {}): KlaraJournalEntry {
  return {
    id: 'je-1',
    description: 'Monthly accrual',
    reference: 'REF-001',
    currency: 'CHF',
    posted_date: '2024-06-30T00:00:00.000Z',
    created_at: '2024-06-30T00:00:00.000Z',
    updated_at: '2024-07-01T00:00:00.000Z',
    lines: [
      {
        id: 'jl-1',
        account_id: 'acct-1000',
        description: 'Debit entry',
        debit_amount: 5000,
        credit_amount: 0,
      },
      {
        id: 'jl-2',
        account_id: 'acct-2000',
        description: 'Credit entry',
        debit_amount: 0,
        credit_amount: 5000,
      },
    ],
    ...overrides,
  }
}

describe('transformJournal', () => {
  it('maps core fields', () => {
    const result = transformJournal(makeJournal())
    expect(result.id).toBe('je-1')
    expect(result.description).toBe('Monthly accrual')
    expect(result.reference).toBe('REF-001')
    expect(result.currency).toBe('CHF')
  })

  it('parses posted_date as postedAt', () => {
    expect(transformJournal(makeJournal()).postedAt).toEqual(new Date('2024-06-30T00:00:00.000Z'))
  })

  it('maps lines to lineItems with debit/credit amounts', () => {
    const result = transformJournal(makeJournal())
    expect(result.lineItems).toHaveLength(2)
    expect(result.lineItems![0].accountId).toBe('acct-1000')
    expect(result.lineItems![0].debitAmount).toBe(5000)
    expect(result.lineItems![0].creditAmount).toBe(0)
    expect(result.lineItems![1].creditAmount).toBe(5000)
  })

  it('omits lineItems when lines is empty', () => {
    const result = transformJournal(makeJournal({ lines: [] }))
    expect(result.lineItems).toBeUndefined()
  })

  it('passes schema validation', () => {
    expect(() => JournalSchema.parse(transformJournal(makeJournal()))).not.toThrow()
  })
})
