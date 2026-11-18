import { describe, it, expect } from 'vitest'
import {
  transformJournal,
  type AfasJournal,
  type AfasJournalLine,
} from '../../../../../../../src/verticals/accounting/adapters/afas/transform/journal'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'

function makeRaw(overrides: Partial<AfasJournal> = {}): AfasJournal {
  return {
    JournalNr: 'JRN-001',
    Description: 'Monthly accruals',
    Reference: 'REF-001',
    CurrencyId: 'EUR',
    AmtTax: 100,
    JournalDate: '2024-01-31',
    Lines: [],
    ...overrides,
  }
}

const sampleLines: AfasJournalLine[] = [
  { AccountNr: '4000', Description: 'Revenue', DebitAmount: 1000, CreditAmount: 0 },
  { AccountNr: '1100', Description: 'AR', DebitAmount: 0, CreditAmount: 1000 },
]

describe('transformJournal (afas)', () => {
  it('maps core fields correctly', () => {
    const result = transformJournal(makeRaw())
    expect(result.id).toBe('JRN-001')
    expect(result.description).toBe('Monthly accruals')
    expect(result.reference).toBe('REF-001')
    expect(result.currency).toBe('EUR')
    // AmtTax=100 → toMinorUnits → 10000
    expect(result.taxAmount).toBe(10000)
  })

  it('parses JournalDate as Date object', () => {
    const result = transformJournal(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-01-31'))
  })

  it('maps journal lines to lineItems', () => {
    const result = transformJournal(makeRaw({ Lines: sampleLines }))
    expect(result.lineItems).toHaveLength(2)
    expect(result.lineItems![0].accountId).toBe('4000')
    expect(result.lineItems![0].description).toBe('Revenue')
    // DebitAmount=1000 → toMinorUnits → 100000
    expect(result.lineItems![0].debitAmount).toBe(100000)
    expect(result.lineItems![1].accountId).toBe('1100')
    // CreditAmount=1000 → toMinorUnits → 100000
    expect(result.lineItems![1].creditAmount).toBe(100000)
  })

  it('returns empty lineItems array when Lines is empty', () => {
    const result = transformJournal(makeRaw({ Lines: [] }))
    expect(result.lineItems).toEqual([])
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformJournal(raw)
    expect(result.metadata).toBe(raw)
  })

  it('passes JournalSchema.parse without throwing', () => {
    const result = transformJournal(makeRaw({ Lines: sampleLines }))
    expect(() => JournalSchema.parse(result)).not.toThrow()
  })
})
