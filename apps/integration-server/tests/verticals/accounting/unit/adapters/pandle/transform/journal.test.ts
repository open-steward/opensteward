import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import {
  transformJournal,
  type PandleJournal,
  type PandleJournalLine,
} from '../../../../../../../src/verticals/accounting/adapters/pandle/transform/journal'

function makeLine(overrides: Partial<PandleJournalLine> = {}): PandleJournalLine {
  return {
    id: 301,
    account_id: 4000,
    contact_id: 50,
    description: 'Sales entry',
    debit: 5000,
    credit: 0,
    tax_amount: 1000,
    ...overrides,
  }
}

function makeJournal(overrides: Partial<PandleJournal> = {}): PandleJournal {
  return {
    id: 3001,
    date: '2024-01-31',
    description: 'Monthly sales journal',
    reference: 'JE-042',
    journal_lines: [
      makeLine(),
      makeLine({ id: 302, account_id: 1200, debit: 0, credit: 5000, description: 'Bank payment' }),
    ],
    ...overrides,
  }
}

describe('transformJournal', () => {
  it('maps id from raw id as string', () => {
    expect(transformJournal(makeJournal()).id).toBe('3001')
  })

  it('maps description', () => {
    expect(transformJournal(makeJournal()).description).toBe('Monthly sales journal')
  })

  it('maps reference', () => {
    expect(transformJournal(makeJournal()).reference).toBe('JE-042')
  })

  it('maps date to postedAt as Date', () => {
    expect(transformJournal(makeJournal()).postedAt).toEqual(new Date('2024-01-31'))
  })

  it('returns undefined postedAt when date is empty', () => {
    expect(transformJournal(makeJournal({ date: '' })).postedAt).toBeUndefined()
  })

  it('maps journal_lines to lineItems', () => {
    const j = transformJournal(makeJournal())
    expect(j.lineItems).toHaveLength(2)

    const debitLine = j.lineItems![0]
    expect(debitLine.id).toBe('301')
    expect(debitLine.accountId).toBe('4000')
    expect(debitLine.contactId).toBe('50')
    expect(debitLine.description).toBe('Sales entry')
    expect(debitLine.debitAmount).toBe(5000)
    expect(debitLine.creditAmount).toBeUndefined()
    expect(debitLine.taxAmount).toBe(1000)

    const creditLine = j.lineItems![1]
    expect(creditLine.id).toBe('302')
    expect(creditLine.accountId).toBe('1200')
    expect(creditLine.debitAmount).toBeUndefined()
    expect(creditLine.creditAmount).toBe(5000)
  })

  it('returns undefined description when empty', () => {
    expect(transformJournal(makeJournal({ description: '' })).description).toBeUndefined()
  })

  it('returns undefined reference when empty', () => {
    expect(transformJournal(makeJournal({ reference: '' })).reference).toBeUndefined()
  })

  it('handles empty journal_lines', () => {
    const j = transformJournal(makeJournal({ journal_lines: [] }))
    expect(j.lineItems).toHaveLength(0)
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
