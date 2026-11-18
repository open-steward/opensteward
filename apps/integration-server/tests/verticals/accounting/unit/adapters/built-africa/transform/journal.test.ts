import { describe, it, expect } from 'vitest'
import {
  transformJournal,
  untransformJournal,
  type BuiltAfricaJournal,
  type BuiltAfricaJournalEntry,
} from '../../../../../../../src/verticals/accounting/adapters/built-africa/transform/journal'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'

function makeEntry(overrides: Partial<BuiltAfricaJournalEntry> = {}): BuiltAfricaJournalEntry {
  return {
    id: 1,
    account_id: 301,
    amount: 500.0,
    account: { id: 301, account_name: 'Sales Revenue' },
    ...overrides,
  }
}

function makeJournal(overrides: Partial<BuiltAfricaJournal> = {}): BuiltAfricaJournal {
  return {
    id: 400,
    description: 'Monthly sales recognition',
    entry_date: '2024-01-31',
    debits: [makeEntry()],
    credits: [makeEntry({ id: 2, account_id: 100, account: { id: 100, account_name: 'Bank' } })],
    created_at: '2024-01-31T08:00:00Z',
    updated_at: '2024-01-31T09:00:00Z',
    deleted_at: null,
    ...overrides,
  }
}

describe('transformJournal', () => {
  it('maps id to string', () => {
    expect(transformJournal(makeJournal()).id).toBe('400')
  })

  it('maps description', () => {
    expect(transformJournal(makeJournal()).description).toBe('Monthly sales recognition')
  })

  it('returns undefined description when empty', () => {
    expect(transformJournal(makeJournal({ description: '' })).description).toBeUndefined()
  })

  it('maps entry_date to postedAt as Date', () => {
    expect(transformJournal(makeJournal()).postedAt).toEqual(new Date('2024-01-31'))
  })

  it('returns undefined postedAt when entry_date is absent', () => {
    expect(transformJournal(makeJournal({ entry_date: undefined })).postedAt).toBeUndefined()
  })

  it('maps created_at to createdAt as Date', () => {
    expect(transformJournal(makeJournal()).createdAt).toEqual(new Date('2024-01-31T08:00:00Z'))
  })

  it('maps updated_at to updatedAt as Date', () => {
    expect(transformJournal(makeJournal()).updatedAt).toEqual(new Date('2024-01-31T09:00:00Z'))
  })

  it('maps debit entries to lineItems with debitAmount in minor units', () => {
    const j = transformJournal(makeJournal())
    const debitLine = j.lineItems![0]
    expect(debitLine.id).toBe('1')
    expect(debitLine.accountId).toBe('301')
    expect(debitLine.description).toBe('Sales Revenue')
    expect(debitLine.debitAmount).toBe(50000)
    expect(debitLine.creditAmount).toBeUndefined()
  })

  it('maps credit entries to lineItems with creditAmount in minor units', () => {
    const j = transformJournal(makeJournal())
    const creditLine = j.lineItems![1]
    expect(creditLine.id).toBe('2')
    expect(creditLine.accountId).toBe('100')
    expect(creditLine.description).toBe('Bank')
    expect(creditLine.creditAmount).toBe(50000)
    expect(creditLine.debitAmount).toBeUndefined()
  })

  it('combines debits and credits into lineItems', () => {
    const j = transformJournal(makeJournal())
    expect(j.lineItems).toHaveLength(2)
  })

  it('returns undefined lineItems when both debits and credits are empty', () => {
    const j = transformJournal(makeJournal({ debits: [], credits: [] }))
    expect(j.lineItems).toBeUndefined()
  })

  it('handles missing account on entry', () => {
    const entry = makeEntry({ account: undefined })
    const j = transformJournal(makeJournal({ debits: [entry], credits: [] }))
    expect(j.lineItems![0].description).toBeUndefined()
  })

  it('passes raw object as metadata', () => {
    const raw = makeJournal()
    expect(transformJournal(raw).metadata).toBe(raw)
  })

  it('output passes schema validation', () => {
    expect(() => JournalSchema.parse(transformJournal(makeJournal()))).not.toThrow()
  })
})

describe('untransformJournal', () => {
  it('converts postedAt to date YYYY-MM-DD string', () => {
    const result = untransformJournal({ postedAt: new Date('2024-01-31') })
    expect(result.date).toBe('2024-01-31')
  })

  it('maps description', () => {
    const result = untransformJournal({ description: 'Monthly sales' })
    expect(result.description).toBe('Monthly sales')
  })

  it('splits lineItems into debits by debitAmount', () => {
    const result = untransformJournal({
      lineItems: [{ accountId: '301', debitAmount: 50000 }],
    })
    expect(result.debits).toHaveLength(1)
    const debit = (result.debits as Array<Record<string, unknown>>)[0]
    expect(debit.account_id).toBe(301)
    expect(debit.amount).toBe(500)
  })

  it('splits lineItems into credits by creditAmount', () => {
    const result = untransformJournal({
      lineItems: [{ accountId: '100', creditAmount: 50000 }],
    })
    expect(result.credits).toHaveLength(1)
    const credit = (result.credits as Array<Record<string, unknown>>)[0]
    expect(credit.account_id).toBe(100)
    expect(credit.amount).toBe(500)
  })

  it('returns undefined debits when no debit lineItems', () => {
    const result = untransformJournal({ lineItems: [{ accountId: '100', creditAmount: 1000 }] })
    expect(result.debits).toBeUndefined()
  })

  it('returns undefined credits when no credit lineItems', () => {
    const result = untransformJournal({ lineItems: [{ accountId: '301', debitAmount: 1000 }] })
    expect(result.credits).toBeUndefined()
  })

  it('round-trips: transform then untransform preserves key fields', () => {
    const raw = makeJournal()
    const canonical = transformJournal(raw)
    const body = untransformJournal(canonical)
    expect(body.description).toBe('Monthly sales recognition')
    expect(body.date).toBe('2024-01-31')
    expect(body.debits).toHaveLength(1)
    expect(body.credits).toHaveLength(1)
  })
})
