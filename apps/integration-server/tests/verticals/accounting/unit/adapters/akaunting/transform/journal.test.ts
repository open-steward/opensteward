import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import {
  transformJournal,
  type AkauntingJournal,
  type AkauntingJournalLine,
} from '../../../../../../../src/verticals/accounting/adapters/akaunting/transform/journal'

function makeLine(overrides: Partial<AkauntingJournalLine> = {}): AkauntingJournalLine {
  return {
    id: 1,
    account_id: 301,
    description: 'Sales entry',
    debit: 5000,
    credit: 0,
    ...overrides,
  }
}

function makeJournal(overrides: Partial<AkauntingJournal> = {}): AkauntingJournal {
  return {
    id: 401,
    paid_at: '2024-01-31',
    description: 'Monthly sales',
    reference: 'JE-042',
    items: [
      makeLine(),
      makeLine({ id: 2, account_id: 100, debit: 0, credit: 5000, description: 'Bank payment' }),
    ],
    ...overrides,
  }
}

describe('transformJournal', () => {
  it('maps id from raw id as string', () => {
    expect(transformJournal(makeJournal()).id).toBe('401')
  })

  it('maps description', () => {
    expect(transformJournal(makeJournal()).description).toBe('Monthly sales')
  })

  it('maps reference', () => {
    expect(transformJournal(makeJournal()).reference).toBe('JE-042')
  })

  it('maps paid_at to postedAt as Date', () => {
    expect(transformJournal(makeJournal()).postedAt).toEqual(new Date('2024-01-31'))
  })

  it('returns undefined postedAt when paid_at is empty', () => {
    expect(transformJournal(makeJournal({ paid_at: '' })).postedAt).toBeUndefined()
  })

  it('returns undefined description when empty', () => {
    expect(transformJournal(makeJournal({ description: '' })).description).toBeUndefined()
  })

  it('returns undefined reference when empty', () => {
    expect(transformJournal(makeJournal({ reference: '' })).reference).toBeUndefined()
  })

  it('maps items to lineItems', () => {
    const j = transformJournal(makeJournal())
    expect(j.lineItems).toHaveLength(2)

    const debitLine = j.lineItems![0]
    expect(debitLine.id).toBe('1')
    expect(debitLine.accountId).toBe('301')
    expect(debitLine.description).toBe('Sales entry')
    expect(debitLine.debitAmount).toBe(5000)
    expect(debitLine.creditAmount).toBeUndefined()

    const creditLine = j.lineItems![1]
    expect(creditLine.id).toBe('2')
    expect(creditLine.accountId).toBe('100')
    expect(creditLine.debitAmount).toBeUndefined()
    expect(creditLine.creditAmount).toBe(5000)
  })

  it('handles empty items array', () => {
    const j = transformJournal(makeJournal({ items: [] }))
    expect(j.lineItems).toHaveLength(0)
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
