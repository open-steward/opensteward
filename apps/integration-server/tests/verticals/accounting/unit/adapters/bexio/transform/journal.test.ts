import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import {
  transformJournal,
  type BexioJournal,
  type BexioJournalLine,
} from '../../../../../../../src/verticals/accounting/adapters/bexio/transform/journal'

function makeJournalLine(overrides: Partial<BexioJournalLine> = {}): BexioJournalLine {
  return {
    id: 'jl-1',
    account_id: 1000,
    contact_id: 42,
    description: 'Payment received',
    debit_amount: 500,
    credit_amount: 0,
    tax_amount: 38,
    ...overrides,
  }
}

function makeJournal(overrides: Partial<BexioJournal> = {}): BexioJournal {
  return {
    id: 501,
    date: '2024-03-15',
    description: 'Monthly journal',
    reference: 'REF-001',
    lines: [],
    ...overrides,
  }
}

describe('transformJournal', () => {
  it('maps id as string', () => {
    expect(transformJournal(makeJournal()).id).toBe('501')
  })

  it('maps description', () => {
    expect(transformJournal(makeJournal()).description).toBe('Monthly journal')
  })

  it('maps reference', () => {
    expect(transformJournal(makeJournal()).reference).toBe('REF-001')
  })

  it('maps date to postedAt as Date', () => {
    expect(transformJournal(makeJournal()).postedAt).toEqual(new Date('2024-03-15'))
  })

  it('returns undefined postedAt when date is empty', () => {
    expect(transformJournal(makeJournal({ date: '' })).postedAt).toBeUndefined()
  })

  it('returns undefined description when empty', () => {
    expect(transformJournal(makeJournal({ description: '' })).description).toBeUndefined()
  })

  it('returns undefined reference when empty', () => {
    expect(transformJournal(makeJournal({ reference: '' })).reference).toBeUndefined()
  })

  it('maps lines to lineItems', () => {
    const raw = makeJournal({ lines: [makeJournalLine()] })
    const result = transformJournal(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('jl-1')
    expect(li.accountId).toBe('1000')
    expect(li.contactId).toBe('42')
    expect(li.description).toBe('Payment received')
    expect(li.debitAmount).toBe(500)
    expect(li.creditAmount).toBeUndefined()
    expect(li.taxAmount).toBe(38)
  })

  it('maps credit line items correctly', () => {
    const raw = makeJournal({
      lines: [makeJournalLine({ debit_amount: 0, credit_amount: 500 })],
    })
    const result = transformJournal(raw)
    const li = result.lineItems![0]
    expect(li.debitAmount).toBeUndefined()
    expect(li.creditAmount).toBe(500)
  })

  it('returns empty lineItems when lines is empty', () => {
    expect(transformJournal(makeJournal({ lines: [] })).lineItems).toEqual([])
  })

  it('returns undefined contactId when contact_id is null', () => {
    const raw = makeJournal({ lines: [makeJournalLine({ contact_id: null })] })
    expect(transformJournal(raw).lineItems![0].contactId).toBeUndefined()
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
