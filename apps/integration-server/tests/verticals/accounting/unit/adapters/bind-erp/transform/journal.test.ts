import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import {
  transformJournal,
  type BindAccountingJournal,
  type BindAccountingJournalItem,
} from '../../../../../../../src/verticals/accounting/adapters/bind-erp/transform/journal'

function makeJournalItem(
  overrides: Partial<BindAccountingJournalItem> = {},
): BindAccountingJournalItem {
  return {
    AccountID: 'acct-100',
    AccountName: 'Cash',
    Description: 'Cash payment',
    Debit: 1000,
    Charge: 0,
    ...overrides,
  }
}

function makeJournal(overrides: Partial<BindAccountingJournal> = {}): BindAccountingJournal {
  return {
    ID: 'jrnl-1',
    DocumentID: 'doc-55',
    Type: 'Income',
    ApplicationDate: '2024-07-01T00:00:00',
    CreationDate: '2024-06-30T00:00:00',
    Number: 9,
    LocationID: 'loc-1',
    PeriodType: 'Monthly',
    Items: [
      makeJournalItem({ AccountID: 'acct-100', Description: 'Cash in', Debit: 1000, Charge: 0 }),
      makeJournalItem({
        AccountID: 'acct-400',
        Description: undefined,
        AccountName: 'Revenue',
        Debit: 0,
        Charge: 1000,
      }),
    ],
    ...overrides,
  }
}

describe('transformJournal', () => {
  it('prefers ID over Number for id', () => {
    expect(transformJournal(makeJournal()).id).toBe('jrnl-1')
  })

  it('falls back to Number string when ID is absent', () => {
    expect(transformJournal(makeJournal({ ID: undefined })).id).toBe('9')
  })

  it('returns empty string when both ID and Number are absent', () => {
    expect(transformJournal(makeJournal({ ID: undefined, Number: undefined })).id).toBe('')
  })

  it('prefers Type over PeriodType for description', () => {
    expect(transformJournal(makeJournal()).description).toBe('Income')
  })

  it('falls back to PeriodType when Type is absent', () => {
    expect(transformJournal(makeJournal({ Type: undefined })).description).toBe('Monthly')
  })

  it('maps DocumentID to reference', () => {
    expect(transformJournal(makeJournal()).reference).toBe('doc-55')
  })

  it('maps ApplicationDate to postedAt', () => {
    expect(transformJournal(makeJournal()).postedAt).toEqual(new Date('2024-07-01T00:00:00'))
  })

  it('maps CreationDate to createdAt', () => {
    expect(transformJournal(makeJournal()).createdAt).toEqual(new Date('2024-06-30T00:00:00'))
  })

  it('maps Debit to debitAmount in line items', () => {
    const j = transformJournal(makeJournal())
    expect(j.lineItems?.[0].debitAmount).toBe(1000)
  })

  it('maps Charge (credit) to creditAmount in line items', () => {
    const j = transformJournal(makeJournal())
    expect(j.lineItems?.[1].creditAmount).toBe(1000)
  })

  it('maps AccountID to accountId in line items', () => {
    const j = transformJournal(makeJournal())
    expect(j.lineItems?.[0].accountId).toBe('acct-100')
    expect(j.lineItems?.[1].accountId).toBe('acct-400')
  })

  it('prefers Description over AccountName for line item description', () => {
    const j = transformJournal(makeJournal())
    expect(j.lineItems?.[0].description).toBe('Cash in')
  })

  it('falls back to AccountName when Description is absent', () => {
    const j = transformJournal(makeJournal())
    expect(j.lineItems?.[1].description).toBe('Revenue')
  })

  it('produces an empty lineItems array when Items is absent', () => {
    const j = transformJournal(makeJournal({ Items: undefined }))
    expect(j.lineItems).toEqual([])
  })

  it('maps all items from Items array', () => {
    expect(transformJournal(makeJournal()).lineItems).toHaveLength(2)
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
