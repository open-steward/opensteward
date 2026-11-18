import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import {
  transformJournal,
  type LexofficeJournalEntry,
} from '../../../../../../../src/verticals/accounting/adapters/lexoffice/transform/journal'

function makeJournalEntry(overrides: Partial<LexofficeJournalEntry> = {}): LexofficeJournalEntry {
  return {
    id: 'journal-uuid-001',
    createdDate: '2024-03-01T08:00:00Z',
    updatedDate: '2024-03-02T10:00:00Z',
    bookingDate: '2024-03-01',
    description: 'Rent payment',
    accountId: 'acc-uuid-001',
    amount: 1000,
    currency: 'EUR',
    debitCreditIndicator: 'debit',
    ...overrides,
  }
}

describe('transformJournal', () => {
  it('maps id correctly', () => {
    expect(transformJournal(makeJournalEntry()).id).toBe('journal-uuid-001')
  })

  it('maps description correctly', () => {
    expect(transformJournal(makeJournalEntry()).description).toBe('Rent payment')
  })

  it('maps currency correctly', () => {
    expect(transformJournal(makeJournalEntry()).currency).toBe('EUR')
  })

  it('parses bookingDate as Date object for postedAt', () => {
    expect(transformJournal(makeJournalEntry()).postedAt).toEqual(new Date('2024-03-01'))
  })

  it('parses createdDate as Date object for createdAt', () => {
    expect(transformJournal(makeJournalEntry()).createdAt).toEqual(new Date('2024-03-01T08:00:00Z'))
  })

  it('parses updatedDate as Date object for updatedAt', () => {
    expect(transformJournal(makeJournalEntry()).updatedAt).toEqual(new Date('2024-03-02T10:00:00Z'))
  })

  it('maps debit indicator to debitAmount in lineitem', () => {
    const result = transformJournal(makeJournalEntry({ debitCreditIndicator: 'debit' }))
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].debitAmount).toBe(1000)
    expect(result.lineItems![0].creditAmount).toBeUndefined()
  })

  it('maps credit indicator to creditAmount in lineitem', () => {
    const result = transformJournal(makeJournalEntry({ debitCreditIndicator: 'credit' }))
    expect(result.lineItems![0].creditAmount).toBe(1000)
    expect(result.lineItems![0].debitAmount).toBeUndefined()
  })

  it('maps accountId to lineitem accountId', () => {
    const result = transformJournal(makeJournalEntry())
    expect(result.lineItems![0].accountId).toBe('acc-uuid-001')
  })

  it('maps description to lineitem description', () => {
    const result = transformJournal(makeJournalEntry())
    expect(result.lineItems![0].description).toBe('Rent payment')
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
