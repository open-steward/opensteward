import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import {
  transformJournal,
  type FikenJournal,
  type FikenJournalLine,
} from '../../../../../../../src/verticals/accounting/adapters/fiken/transform/journal'

function makeJournalLine(overrides: Partial<FikenJournalLine> = {}): FikenJournalLine {
  return {
    accountCode: '3000',
    debitAmount: 5000,
    creditAmount: 0,
    description: 'Revenue posting',
    ...overrides,
  }
}

function makeJournal(overrides: Partial<FikenJournal> = {}): FikenJournal {
  return {
    journalEntryId: 501,
    date: '2024-06-15',
    description: 'Monthly close',
    journalEntryNumber: 'JE-501',
    lines: [],
    ...overrides,
  }
}

describe('transformJournal', () => {
  it('maps journalEntryId to id as string', () => {
    expect(transformJournal(makeJournal()).id).toBe('501')
  })

  it('maps description', () => {
    expect(transformJournal(makeJournal()).description).toBe('Monthly close')
  })

  it('maps journalEntryNumber to reference', () => {
    expect(transformJournal(makeJournal()).reference).toBe('JE-501')
  })

  it('maps date to postedAt as Date', () => {
    expect(transformJournal(makeJournal()).postedAt).toEqual(new Date('2024-06-15'))
  })

  it('returns undefined postedAt when date is empty', () => {
    expect(transformJournal(makeJournal({ date: '' })).postedAt).toBeUndefined()
  })

  it('returns undefined description when description is empty', () => {
    expect(transformJournal(makeJournal({ description: '' })).description).toBeUndefined()
  })

  it('returns undefined reference when journalEntryNumber is empty', () => {
    expect(transformJournal(makeJournal({ journalEntryNumber: '' })).reference).toBeUndefined()
  })

  it('maps lines to lineItems', () => {
    const raw = makeJournal({ lines: [makeJournalLine()] })
    const result = transformJournal(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.accountId).toBe('3000')
    expect(li.description).toBe('Revenue posting')
    expect(li.debitAmount).toBe(5000)
    expect(li.creditAmount).toBeUndefined()
  })

  it('maps credit line correctly', () => {
    const raw = makeJournal({
      lines: [makeJournalLine({ debitAmount: 0, creditAmount: 5000 })],
    })
    const result = transformJournal(raw)
    const li = result.lineItems![0]
    expect(li.debitAmount).toBeUndefined()
    expect(li.creditAmount).toBe(5000)
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
