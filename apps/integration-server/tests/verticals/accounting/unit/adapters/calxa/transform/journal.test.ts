import { describe, it, expect } from 'vitest'
import {
  transformJournal,
  type CalxaJournal,
  type CalxaJournalLine,
} from '../../../../../../../src/verticals/accounting/adapters/calxa/transform/journal'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'

function makeJournalLine(overrides: Partial<CalxaJournalLine> = {}): CalxaJournalLine {
  return {
    id: 'jline-001',
    accountId: 'acct-1000',
    description: 'Revenue entry',
    debitAmount: 0,
    creditAmount: 500,
    ...overrides,
  }
}

function makeJournal(overrides: Partial<CalxaJournal> = {}): CalxaJournal {
  return {
    id: 'jrnl-001',
    journalNumber: 'J-001',
    description: 'Monthly revenue recognition',
    reference: 'INV-1042',
    source: 'invoice',
    currency: 'USD',
    lines: [],
    date: '2024-03-15',
    ...overrides,
  }
}

describe('transformJournal', () => {
  it('maps id as-is', () => {
    expect(transformJournal(makeJournal()).id).toBe('jrnl-001')
  })

  it('maps description', () => {
    expect(transformJournal(makeJournal()).description).toBe('Monthly revenue recognition')
  })

  it('maps reference', () => {
    expect(transformJournal(makeJournal()).reference).toBe('INV-1042')
  })

  it('falls back to journalNumber when reference is undefined', () => {
    const result = transformJournal(makeJournal({ reference: undefined, journalNumber: 'J-001' }))
    expect(result.reference).toBe('J-001')
  })

  it('maps source', () => {
    expect(transformJournal(makeJournal()).source).toBe('invoice')
  })

  it('maps currency', () => {
    expect(transformJournal(makeJournal()).currency).toBe('USD')
  })

  it('maps date to postedAt as Date', () => {
    expect(transformJournal(makeJournal()).postedAt).toEqual(new Date('2024-03-15'))
  })

  it('returns undefined postedAt when date is undefined', () => {
    expect(transformJournal(makeJournal({ date: undefined })).postedAt).toBeUndefined()
  })

  it('maps lines to lineItems', () => {
    const raw = makeJournal({ lines: [makeJournalLine()] })
    const result = transformJournal(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('jline-001')
    expect(li.accountId).toBe('acct-1000')
    expect(li.description).toBe('Revenue entry')
    expect(li.debitAmount).toBe(0)
    expect(li.creditAmount).toBe(500)
  })

  it('maps empty lines to empty lineItems array', () => {
    expect(transformJournal(makeJournal({ lines: [] })).lineItems).toHaveLength(0)
  })

  it('maps undefined lines to empty lineItems array', () => {
    expect(transformJournal(makeJournal({ lines: undefined })).lineItems).toHaveLength(0)
  })

  it('maps createdAt to Date', () => {
    const result = transformJournal(makeJournal({ createdAt: '2024-01-15T09:30:00Z' }))
    expect(result.createdAt).toEqual(new Date('2024-01-15T09:30:00Z'))
  })

  it('maps updatedAt to Date', () => {
    const result = transformJournal(makeJournal({ updatedAt: '2024-02-01T14:20:00Z' }))
    expect(result.updatedAt).toEqual(new Date('2024-02-01T14:20:00Z'))
  })

  it('passes raw object as metadata', () => {
    const raw = makeJournal()
    expect(transformJournal(raw).metadata).toBe(raw)
  })

  it('output passes schema validation', () => {
    expect(() => JournalSchema.parse(transformJournal(makeJournal()))).not.toThrow()
  })
})
