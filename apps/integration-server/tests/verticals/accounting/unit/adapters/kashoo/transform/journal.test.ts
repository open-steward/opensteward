import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import {
  transformJournal,
  type KashooJournal,
  type KashooJournalLine,
} from '../../../../../../../src/verticals/accounting/adapters/kashoo/transform/journal'

function makeLine(overrides: Partial<KashooJournalLine> = {}): KashooJournalLine {
  return {
    id: 'line-1',
    account_id: 'acc-4000',
    description: 'Sales entry',
    debit: 5000,
    credit: 0,
    contact_id: 'contact-1',
    ...overrides,
  }
}

function makeJournal(overrides: Partial<KashooJournal> = {}): KashooJournal {
  return {
    id: 'jrn-001',
    date: '2024-01-31',
    description: 'Monthly sales',
    reference: 'REF-42',
    currency: 'USD',
    lines: [
      makeLine(),
      makeLine({ id: 'line-2', account_id: 'acc-1000', debit: 0, credit: 5000, description: 'Bank payment' }),
    ],
    ...overrides,
  }
}

describe('transformJournal', () => {
  it('maps id from raw id', () => {
    expect(transformJournal(makeJournal()).id).toBe('jrn-001')
  })

  it('maps description', () => {
    expect(transformJournal(makeJournal()).description).toBe('Monthly sales')
  })

  it('maps reference', () => {
    expect(transformJournal(makeJournal()).reference).toBe('REF-42')
  })

  it('maps currency', () => {
    expect(transformJournal(makeJournal()).currency).toBe('USD')
  })

  it('maps date (ISO string) to postedAt as Date', () => {
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
    expect(debitLine.accountId).toBe('acc-4000')
    expect(debitLine.description).toBe('Sales entry')
    expect(debitLine.debitAmount).toBe(5000)
    expect(debitLine.creditAmount).toBeUndefined()
    expect(debitLine.contactId).toBe('contact-1')

    const creditLine = j.lineItems![1]
    expect(creditLine.id).toBe('line-2')
    expect(creditLine.accountId).toBe('acc-1000')
    expect(creditLine.debitAmount).toBeUndefined()
    expect(creditLine.creditAmount).toBe(5000)
  })

  it('returns undefined description when description is empty', () => {
    expect(transformJournal(makeJournal({ description: '' })).description).toBeUndefined()
  })

  it('returns undefined reference when reference is empty', () => {
    expect(transformJournal(makeJournal({ reference: '' })).reference).toBeUndefined()
  })

  it('handles empty lines array', () => {
    expect(transformJournal(makeJournal({ lines: [] })).lineItems).toHaveLength(0)
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
