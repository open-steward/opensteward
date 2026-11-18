import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import {
  transformJournal,
  type PatriotJournal,
  type PatriotJournalLine,
} from '../../../../../../../src/verticals/accounting/adapters/patriot/transform/journal'

function makeJournalLine(overrides: Partial<PatriotJournalLine> = {}): PatriotJournalLine {
  return {
    id: 'jl-1',
    account_id: 'acc-100',
    description: 'Vendor payment',
    debit: 1000,
    credit: 0,
    tax_amount: 200,
    contact_id: 'contact-1',
    ...overrides,
  }
}

function makeJournal(overrides: Partial<PatriotJournal> = {}): PatriotJournal {
  return {
    id: 'je-001',
    date: '2024-03-01',
    description: 'March journal entry',
    reference: 'JE-2024-001',
    currency: 'USD',
    lines: [],
    ...overrides,
  }
}

describe('transformJournal', () => {
  it('maps id from raw id', () => {
    expect(transformJournal(makeJournal()).id).toBe('je-001')
  })

  it('maps description', () => {
    expect(transformJournal(makeJournal()).description).toBe('March journal entry')
  })

  it('maps reference', () => {
    expect(transformJournal(makeJournal()).reference).toBe('JE-2024-001')
  })

  it('maps currency', () => {
    expect(transformJournal(makeJournal()).currency).toBe('USD')
  })

  it('maps date to postedAt as Date', () => {
    expect(transformJournal(makeJournal()).postedAt).toEqual(new Date('2024-03-01'))
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
    expect(li.accountId).toBe('acc-100')
    expect(li.contactId).toBe('contact-1')
    expect(li.description).toBe('Vendor payment')
    expect(li.debitAmount).toBe(1000)
    expect(li.creditAmount).toBeUndefined()
    expect(li.taxAmount).toBe(200)
  })

  it('maps credit line correctly', () => {
    const raw = makeJournal({
      lines: [makeJournalLine({ debit: 0, credit: 500 })],
    })
    const result = transformJournal(raw)
    const li = result.lineItems![0]
    expect(li.debitAmount).toBeUndefined()
    expect(li.creditAmount).toBe(500)
  })

  it('handles empty lines array', () => {
    expect(transformJournal(makeJournal({ lines: [] })).lineItems).toEqual([])
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
