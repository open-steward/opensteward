import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import {
  transformJournal,
  type BillomatJournal,
  type BillomatJournalLine,
} from '../../../../../../../src/verticals/accounting/adapters/billomat/transform/journal'

function makeLine(overrides: Partial<BillomatJournalLine> = {}): BillomatJournalLine {
  return {
    id: 'line-1',
    account_id: 'acc-8400',
    description: 'Umsatz',
    debit: 5000,
    credit: 0,
    tax_amount: 950,
    ...overrides,
  }
}

function makeJournal(overrides: Partial<BillomatJournal> = {}): BillomatJournal {
  return {
    id: 'jrn-001',
    date: '2024-01-31',
    description: 'Monatliche Buchung',
    reference: 'BEL-42',
    lines: [
      makeLine(),
      makeLine({ id: 'line-2', account_id: 'acc-1200', debit: 0, credit: 5000, description: 'Bankzahlung' }),
    ],
    ...overrides,
  }
}

describe('transformJournal', () => {
  it('maps id from raw id', () => {
    expect(transformJournal(makeJournal()).id).toBe('jrn-001')
  })

  it('maps description', () => {
    expect(transformJournal(makeJournal()).description).toBe('Monatliche Buchung')
  })

  it('maps reference', () => {
    expect(transformJournal(makeJournal()).reference).toBe('BEL-42')
  })

  it('maps date to postedAt as Date', () => {
    expect(transformJournal(makeJournal()).postedAt).toEqual(new Date('2024-01-31'))
  })

  it('returns undefined postedAt when date is empty', () => {
    expect(transformJournal(makeJournal({ date: '' })).postedAt).toBeUndefined()
  })

  it('maps lines to lineItems', () => {
    const j = transformJournal(makeJournal())
    expect(j.lineItems).toHaveLength(2)

    const debitLine = j.lineItems![0]
    expect(debitLine.id).toBe('line-1')
    expect(debitLine.accountId).toBe('acc-8400')
    expect(debitLine.description).toBe('Umsatz')
    expect(debitLine.debitAmount).toBe(5000)
    expect(debitLine.creditAmount).toBeUndefined()
    expect(debitLine.taxAmount).toBe(950)

    const creditLine = j.lineItems![1]
    expect(creditLine.id).toBe('line-2')
    expect(creditLine.accountId).toBe('acc-1200')
    expect(creditLine.debitAmount).toBeUndefined()
    expect(creditLine.creditAmount).toBe(5000)
  })

  it('returns empty lineItems when lines is undefined', () => {
    const raw = makeJournal({ lines: undefined as unknown as BillomatJournalLine[] })
    expect(transformJournal(raw).lineItems).toEqual([])
  })

  it('returns undefined description when empty', () => {
    expect(transformJournal(makeJournal({ description: '' })).description).toBeUndefined()
  })

  it('returns undefined reference when empty', () => {
    expect(transformJournal(makeJournal({ reference: '' })).reference).toBeUndefined()
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
