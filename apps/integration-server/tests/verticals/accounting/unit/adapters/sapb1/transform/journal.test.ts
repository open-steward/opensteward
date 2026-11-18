import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import {
  transformJournal,
  type SapB1JournalEntry,
  type SapB1JournalLine,
} from '../../../../../../../src/verticals/accounting/adapters/sapb1/transform/journal'

function makeJournalLine(overrides: Partial<SapB1JournalLine> = {}): SapB1JournalLine {
  return {
    Account: '1001',
    Debit: 500,
    Credit: 0,
    LineMemo: 'Debit entry',
    ...overrides,
  }
}

function makeJournal(overrides: Partial<SapB1JournalEntry> = {}): SapB1JournalEntry {
  return {
    JdtNum: 5001,
    ReferenceDate: '2024-03-01',
    Memo: 'Monthly closing',
    TransactionCode: 'CLOSE',
    JournalEntryLines: [makeJournalLine()],
    ...overrides,
  }
}

describe('transformJournal', () => {
  it('maps JdtNum as string to id', () => {
    expect(transformJournal(makeJournal()).id).toBe('5001')
  })

  it('maps Memo to description', () => {
    expect(transformJournal(makeJournal()).description).toBe('Monthly closing')
  })

  it('maps TransactionCode to reference', () => {
    expect(transformJournal(makeJournal()).reference).toBe('CLOSE')
  })

  it('parses ReferenceDate as Date', () => {
    expect(transformJournal(makeJournal()).postedAt).toEqual(new Date('2024-03-01'))
  })

  it('sets postedAt to undefined when ReferenceDate is empty', () => {
    expect(transformJournal(makeJournal({ ReferenceDate: '' })).postedAt).toBeUndefined()
  })

  it('maps line Account to accountId', () => {
    const result = transformJournal(makeJournal())
    expect(result.lineItems?.[0].accountId).toBe('1001')
  })

  it('maps line LineMemo to description', () => {
    const result = transformJournal(makeJournal())
    expect(result.lineItems?.[0].description).toBe('Debit entry')
  })

  it('maps line Debit to debitAmount', () => {
    const result = transformJournal(makeJournal())
    expect(result.lineItems?.[0].debitAmount).toBe(500)
  })

  it('maps line Credit to creditAmount', () => {
    const result = transformJournal(
      makeJournal({ JournalEntryLines: [makeJournalLine({ Account: '2001', Debit: 0, Credit: 500 })] }),
    )
    expect(result.lineItems?.[0].creditAmount).toBe(500)
  })

  it('produces empty lineItems for empty JournalEntryLines', () => {
    const result = transformJournal(makeJournal({ JournalEntryLines: [] }))
    expect(result.lineItems).toHaveLength(0)
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeJournal()
    expect(transformJournal(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformJournal(makeJournal())
    expect(() => JournalSchema.parse(result)).not.toThrow()
  })
})
