import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import {
  transformJournal,
  type FakturoidJournal,
  type FakturoidJournalLine,
} from '../../../../../../../src/verticals/accounting/adapters/fakturoid/transform/journal'

function makeLine(overrides: Partial<FakturoidJournalLine> = {}): FakturoidJournalLine {
  return {
    id: 501,
    account_id: 601,
    description: 'Sales entry',
    debit: 10000,
    credit: 0,
    ...overrides,
  }
}

function makeJournal(overrides: Partial<FakturoidJournal> = {}): FakturoidJournal {
  return {
    id: 5001,
    document_number: 'JE-2024-001',
    description: 'Monthly sales journal',
    date: '2024-01-31',
    lines: [
      makeLine(),
      makeLine({ id: 502, account_id: 311, debit: 0, credit: 10000, description: 'Bank payment' }),
    ],
    ...overrides,
  }
}

describe('transformJournal', () => {
  it('maps id from raw id as string', () => {
    expect(transformJournal(makeJournal()).id).toBe('5001')
  })

  it('maps description', () => {
    expect(transformJournal(makeJournal()).description).toBe('Monthly sales journal')
  })

  it('maps document_number to reference', () => {
    expect(transformJournal(makeJournal()).reference).toBe('JE-2024-001')
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
    expect(debitLine.id).toBe('501')
    expect(debitLine.accountId).toBe('601')
    expect(debitLine.description).toBe('Sales entry')
    expect(debitLine.debitAmount).toBe(10000)
    expect(debitLine.creditAmount).toBeUndefined()

    const creditLine = j.lineItems![1]
    expect(creditLine.id).toBe('502')
    expect(creditLine.accountId).toBe('311')
    expect(creditLine.debitAmount).toBeUndefined()
    expect(creditLine.creditAmount).toBe(10000)
  })

  it('returns undefined description when empty', () => {
    expect(transformJournal(makeJournal({ description: '' })).description).toBeUndefined()
  })

  it('returns undefined reference when document_number is empty', () => {
    expect(transformJournal(makeJournal({ document_number: '' })).reference).toBeUndefined()
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
