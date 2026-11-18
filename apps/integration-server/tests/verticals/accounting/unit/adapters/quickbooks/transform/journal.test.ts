import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import {
  transformJournal,
  type QBOJournalEntry,
  type QBOJournalLine,
} from '../../../../../../../src/verticals/accounting/adapters/quickbooks/transform/journal'

function makeJournalLine(overrides: Partial<QBOJournalLine> = {}): QBOJournalLine {
  return {
    JournalEntryLineDetail: {
      PostingType: 'Debit',
      AccountRef: { value: 'acc-10' },
    },
    Description: 'Revenue entry',
    Amount: 750,
    ...overrides,
  }
}

function makeJournalEntry(overrides: Partial<QBOJournalEntry> = {}): QBOJournalEntry {
  return {
    Id: 'je-1',
    TxnDate: '2024-11-01',
    DocNumber: 'JE-2024-001',
    Line: [],
    ...overrides,
  }
}

describe('transformJournal', () => {
  it('maps Id to id correctly', () => {
    expect(transformJournal(makeJournalEntry()).id).toBe('je-1')
  })

  it('maps DocNumber to reference', () => {
    expect(transformJournal(makeJournalEntry()).reference).toBe('JE-2024-001')
  })

  it('parses TxnDate as Date object for postedAt', () => {
    expect(transformJournal(makeJournalEntry()).postedAt).toEqual(new Date('2024-11-01'))
  })

  it('sets postedAt to undefined when TxnDate is empty', () => {
    expect(transformJournal(makeJournalEntry({ TxnDate: '' })).postedAt).toBeUndefined()
  })

  it('maps debit line correctly', () => {
    const line = makeJournalLine({ JournalEntryLineDetail: { PostingType: 'Debit', AccountRef: { value: 'acc-10' } }, Amount: 750 })
    const result = transformJournal(makeJournalEntry({ Line: [line] }))
    expect(result.lineItems?.[0]).toMatchObject({
      accountId: 'acc-10',
      description: 'Revenue entry',
      debitAmount: 750,
      creditAmount: undefined,
    })
  })

  it('maps credit line correctly', () => {
    const line = makeJournalLine({ JournalEntryLineDetail: { PostingType: 'Credit', AccountRef: { value: 'acc-20' } }, Amount: 750 })
    const result = transformJournal(makeJournalEntry({ Line: [line] }))
    expect(result.lineItems?.[0]).toMatchObject({
      accountId: 'acc-20',
      debitAmount: undefined,
      creditAmount: 750,
    })
  })

  it('maps Entity contactId from line detail', () => {
    const line = makeJournalLine({
      JournalEntryLineDetail: {
        PostingType: 'Debit',
        AccountRef: { value: 'acc-10' },
        Entity: { EntityRef: { value: 'contact-5' } },
      },
    })
    const result = transformJournal(makeJournalEntry({ Line: [line] }))
    expect(result.lineItems?.[0].contactId).toBe('contact-5')
  })

  it('produces empty lineItems array when Line is empty', () => {
    expect(transformJournal(makeJournalEntry({ Line: [] })).lineItems).toEqual([])
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
