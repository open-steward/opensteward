import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import {
  transformJournal,
  type TripletexVoucher,
  type TripletexPostingEntry,
} from '../../../../../../../src/verticals/accounting/adapters/tripletex/transform/journal'

function makePosting(overrides: Partial<TripletexPostingEntry> = {}): TripletexPostingEntry {
  return {
    id: 1,
    account: { id: 10, number: 1500, name: 'Receivables' },
    description: 'Sales posting',
    amountCurrency: 500,
    currency: { id: '1', code: 'NOK' },
    date: '2024-06-01',
    ...overrides,
  }
}

function makeVoucher(overrides: Partial<TripletexVoucher> = {}): TripletexVoucher {
  return {
    id: 404,
    voucherNumber: 20240001,
    date: '2024-06-01',
    description: 'Monthly journal',
    postings: [makePosting()],
    ...overrides,
  }
}

describe('transformJournal', () => {
  it('maps id correctly', () => {
    expect(transformJournal(makeVoucher()).id).toBe('404')
  })

  it('maps description correctly', () => {
    expect(transformJournal(makeVoucher()).description).toBe('Monthly journal')
  })

  it('maps voucherNumber to reference as string', () => {
    expect(transformJournal(makeVoucher()).reference).toBe('20240001')
  })

  it('parses date as postedAt Date object', () => {
    expect(transformJournal(makeVoucher()).postedAt).toEqual(new Date('2024-06-01'))
  })

  it('maps postings to lineItems', () => {
    const result = transformJournal(makeVoucher())
    expect(result.lineItems).toHaveLength(1)
  })

  it('maps positive amountCurrency posting to debitAmount', () => {
    const result = transformJournal(makeVoucher({ postings: [makePosting({ amountCurrency: 500 })] }))
    if (result.lineItems == null) throw new Error('expected lineItems to be defined')
    expect(result.lineItems[0].debitAmount).toBe(500)
    expect(result.lineItems[0].creditAmount).toBeUndefined()
  })

  it('maps negative amountCurrency posting to creditAmount', () => {
    const result = transformJournal(makeVoucher({ postings: [makePosting({ amountCurrency: -300 })] }))
    if (result.lineItems == null) throw new Error('expected lineItems to be defined')
    expect(result.lineItems[0].creditAmount).toBe(300)
    expect(result.lineItems[0].debitAmount).toBeUndefined()
  })

  it('maps posting account number to lineitem accountId', () => {
    const result = transformJournal(makeVoucher())
    expect(result.lineItems?.[0].accountId).toBe('1500')
  })

  it('produces empty lineItems when postings is absent', () => {
    const result = transformJournal(makeVoucher({ postings: [] }))
    expect(result.lineItems).toHaveLength(0)
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeVoucher()
    expect(transformJournal(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformJournal(makeVoucher())
    expect(() => JournalSchema.parse(result)).not.toThrow()
  })
})
