import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import {
  transformJournal,
  type PowerOfficeJournalEntry,
  type PowerOfficeJournalEntryLine,
} from '../../../../../../../src/verticals/accounting/adapters/poweroffice/transform/journal'

function makeJournalLine(overrides: Partial<PowerOfficeJournalEntryLine> = {}): PowerOfficeJournalEntryLine {
  return {
    id: 1,
    accountCode: '1920',
    description: 'Bank deposit',
    amount: 1000,
    debitCreditCode: 'D',
    currencyCode: 'NOK',
    ...overrides,
  }
}

function makeJournalEntry(overrides: Partial<PowerOfficeJournalEntry> = {}): PowerOfficeJournalEntry {
  return {
    id: 200,
    transactionDate: '2024-06-01',
    description: 'Monthly closing',
    lines: [],
    ...overrides,
  }
}

describe('transformJournal', () => {
  it('maps id correctly', () => {
    expect(transformJournal(makeJournalEntry()).id).toBe('200')
  })

  it('maps description correctly', () => {
    expect(transformJournal(makeJournalEntry()).description).toBe('Monthly closing')
  })

  it('parses transactionDate as Date object for postedAt', () => {
    expect(transformJournal(makeJournalEntry()).postedAt).toEqual(new Date('2024-06-01'))
  })

  it('sets postedAt to undefined when transactionDate is empty', () => {
    expect(transformJournal(makeJournalEntry({ transactionDate: '' })).postedAt).toBeUndefined()
  })

  it('maps debit line correctly', () => {
    const line = makeJournalLine({ debitCreditCode: 'D', amount: 500 })
    const result = transformJournal(makeJournalEntry({ lines: [line] }))
    expect(result.lineItems?.[0]).toMatchObject({
      accountId: '1920',
      description: 'Bank deposit',
      debitAmount: 500,
      creditAmount: undefined,
    })
  })

  it('maps credit line correctly', () => {
    const line = makeJournalLine({ debitCreditCode: 'C', amount: 500 })
    const result = transformJournal(makeJournalEntry({ lines: [line] }))
    expect(result.lineItems?.[0]).toMatchObject({
      accountId: '1920',
      description: 'Bank deposit',
      debitAmount: undefined,
      creditAmount: 500,
    })
  })

  it('produces empty lineItems array when lines is empty', () => {
    expect(transformJournal(makeJournalEntry({ lines: [] })).lineItems).toEqual([])
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
