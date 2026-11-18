import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import {
  transformJournal,
  type TwentyFourSevenJournal,
  type TwentyFourSevenJournalLine,
} from '../../../../../../../src/verticals/accounting/adapters/twentyfoursevenoffice/transform/journal'

function makeLine(overrides: Partial<TwentyFourSevenJournalLine> = {}): TwentyFourSevenJournalLine {
  return {
    id: 'line-1',
    accountId: 'acc-3000',
    description: 'Sales entry',
    debit: 5000,
    credit: 0,
    taxAmount: 1000,
    contactId: 'contact-1',
    ...overrides,
  }
}

function makeJournal(overrides: Partial<TwentyFourSevenJournal> = {}): TwentyFourSevenJournal {
  return {
    id: 'je-001',
    entryDate: '2024-01-31',
    description: 'Monthly sales',
    voucherNumber: 'V-42',
    lines: [
      makeLine(),
      makeLine({ id: 'line-2', accountId: 'acc-1930', debit: 0, credit: 5000, description: 'Bank payment' }),
    ],
    ...overrides,
  }
}

describe('transformJournal', () => {
  it('maps id from raw id', () => {
    expect(transformJournal(makeJournal()).id).toBe('je-001')
  })

  it('maps description', () => {
    expect(transformJournal(makeJournal()).description).toBe('Monthly sales')
  })

  it('maps voucherNumber to reference', () => {
    expect(transformJournal(makeJournal()).reference).toBe('V-42')
  })

  it('maps entryDate to postedAt as Date', () => {
    expect(transformJournal(makeJournal()).postedAt).toEqual(new Date('2024-01-31'))
  })

  it('returns undefined postedAt when entryDate is empty', () => {
    expect(transformJournal(makeJournal({ entryDate: '' })).postedAt).toBeUndefined()
  })

  it('returns undefined reference when voucherNumber is empty', () => {
    expect(transformJournal(makeJournal({ voucherNumber: '' })).reference).toBeUndefined()
  })

  it('maps lines to lineItems', () => {
    const j = transformJournal(makeJournal())
    expect(j.lineItems).toHaveLength(2)

    const debitLine = j.lineItems![0]
    expect(debitLine.id).toBe('line-1')
    expect(debitLine.accountId).toBe('acc-3000')
    expect(debitLine.description).toBe('Sales entry')
    expect(debitLine.debitAmount).toBe(5000)
    expect(debitLine.creditAmount).toBeUndefined()
    expect(debitLine.taxAmount).toBe(1000)
    expect(debitLine.contactId).toBe('contact-1')

    const creditLine = j.lineItems![1]
    expect(creditLine.id).toBe('line-2')
    expect(creditLine.accountId).toBe('acc-1930')
    expect(creditLine.debitAmount).toBeUndefined()
    expect(creditLine.creditAmount).toBe(5000)
  })

  it('returns empty lineItems when lines is undefined', () => {
    const j = transformJournal(makeJournal({ lines: undefined as unknown as TwentyFourSevenJournalLine[] }))
    expect(j.lineItems).toHaveLength(0)
  })

  it('maps description to undefined when empty', () => {
    expect(transformJournal(makeJournal({ description: '' })).description).toBeUndefined()
  })

  it('passes raw object as metadata', () => {
    const raw = makeJournal()
    expect(transformJournal(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformJournal(makeJournal())
    expect(() => JournalSchema.parse(result)).not.toThrow()
  })
})
