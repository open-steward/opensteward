import { describe, it, expect } from 'vitest'
import {
  transformJournal,
  untransformJournal,
  type BigcapitalManualJournal,
  type BigcapitalManualJournalEntry,
} from '../../../../../../../src/verticals/accounting/adapters/bigcapital/transform/journal'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'

const sampleEntries: BigcapitalManualJournalEntry[] = [
  { index: 1, accountId: 4000, debit: 500, note: 'Revenue entry', contactId: 7 },
  { index: 2, accountId: 1100, credit: 500, note: 'AR entry' },
]

function makeRaw(overrides: Partial<BigcapitalManualJournal> = {}): BigcapitalManualJournal {
  return {
    id: 9,
    journalNumber: 'JRN-009',
    date: '2024-01-31',
    journalType: 'manual',
    reference: 'REF-009',
    description: 'Revenue recognition',
    currencyCode: 'USD',
    amount: 500,
    isPublished: true,
    entries: sampleEntries,
    createdAt: '2024-01-28T00:00:00.000Z',
    updatedAt: '2024-01-31T00:00:00.000Z',
    ...overrides,
  }
}

describe('transformJournal (bigcapital)', () => {
  it('maps core fields correctly', () => {
    const result = transformJournal(makeRaw())
    expect(result.id).toBe('9')
    expect(result.description).toBe('Revenue recognition')
    // reference wins over journalNumber
    expect(result.reference).toBe('REF-009')
  })

  it('falls back reference to journalNumber when reference is missing', () => {
    const result = transformJournal(makeRaw({ reference: undefined }))
    expect(result.reference).toBe('JRN-009')
  })

  it('parses date as postedAt Date', () => {
    const result = transformJournal(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-01-31'))
  })

  it('maps entries to lineItems', () => {
    const result = transformJournal(makeRaw())
    expect(result.lineItems).toHaveLength(2)
    const li = result.lineItems![0]
    expect(li.accountId).toBe('4000')
    expect(li.description).toBe('Revenue entry')
    // debit=500 → toMinor → 50000
    expect(li.debitAmount).toBe(50000)
    expect(li.contactId).toBe('7')
    const li2 = result.lineItems![1]
    expect(li2.accountId).toBe('1100')
    // credit=500 → toMinor → 50000
    expect(li2.creditAmount).toBe(50000)
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformJournal(raw)
    expect(result.metadata).toBe(raw)
  })

  it('passes JournalSchema.parse without throwing', () => {
    const result = transformJournal(makeRaw())
    expect(() => JournalSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformJournal (description)', () => {
    const canonical = transformJournal(makeRaw())
    const back = untransformJournal(canonical)
    expect(back['description']).toBe('Revenue recognition')
  })
})
