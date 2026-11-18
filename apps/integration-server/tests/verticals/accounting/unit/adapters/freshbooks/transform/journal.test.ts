import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import {
  transformJournal,
  type FreshBooksJournalEntry,
} from '../../../../../../../src/verticals/accounting/adapters/freshbooks/transform/journal'

function makeJournalEntry(overrides: Partial<FreshBooksJournalEntry> = {}): FreshBooksJournalEntry {
  return {
    id: 300,
    account_id: 10,
    credit: { amount: '0.00' },
    debit: { amount: '500.00' },
    description: 'Payroll entry',
    created_at: '2024-03-01T10:00:00Z',
    updated_at: '2024-03-02T12:00:00Z',
    ...overrides,
  }
}

describe('transformJournal', () => {
  it('maps id correctly (number to string)', () => {
    expect(transformJournal(makeJournalEntry()).id).toBe('300')
  })

  it('maps description correctly', () => {
    expect(transformJournal(makeJournalEntry()).description).toBe('Payroll entry')
  })

  it('parses created_at as Date object for createdAt', () => {
    expect(transformJournal(makeJournalEntry()).createdAt).toEqual(new Date('2024-03-01T10:00:00Z'))
  })

  it('parses updated_at as Date object for updatedAt', () => {
    expect(transformJournal(makeJournalEntry()).updatedAt).toEqual(new Date('2024-03-02T12:00:00Z'))
  })

  it('maps debit amount to lineitem debitAmount', () => {
    const result = transformJournal(makeJournalEntry())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].debitAmount).toBe(500)
  })

  it('maps credit amount to lineitem creditAmount', () => {
    const result = transformJournal(makeJournalEntry({ credit: { amount: '250.00' }, debit: { amount: '0.00' } }))
    expect(result.lineItems![0].creditAmount).toBe(250)
  })

  it('maps account_id to lineitem accountId', () => {
    const result = transformJournal(makeJournalEntry())
    expect(result.lineItems![0].accountId).toBe('10')
  })

  it('maps description to lineitem description', () => {
    const result = transformJournal(makeJournalEntry())
    expect(result.lineItems![0].description).toBe('Payroll entry')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeJournalEntry()
    expect(transformJournal(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformJournal(makeJournalEntry())
    expect(() => JournalSchema.parse(result)).not.toThrow()
  })
})
