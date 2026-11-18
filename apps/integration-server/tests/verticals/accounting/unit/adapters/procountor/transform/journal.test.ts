import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import {
  transformJournal,
  type ProcountorJournalEntry,
} from '../../../../../../../src/verticals/accounting/adapters/procountor/transform/journal'

function makeJournal(overrides: Partial<ProcountorJournalEntry> = {}): ProcountorJournalEntry {
  return {
    id: 42,
    description: 'Monthly salary',
    voucherNumber: 1001,
    date: '2024-01-31',
    rows: [
      {
        id: 1,
        accountNumber: '7000',
        description: 'Gross salary',
        debit: 50000,
        credit: 0,
      },
      {
        id: 2,
        accountNumber: '1910',
        description: 'Bank payment',
        debit: 0,
        credit: 50000,
      },
    ],
    ...overrides,
  }
}

describe('transformJournal', () => {
  it('maps id as string', () => {
    expect(transformJournal(makeJournal()).id).toBe('42')
  })

  it('maps description', () => {
    expect(transformJournal(makeJournal()).description).toBe('Monthly salary')
  })

  it('maps voucherNumber to reference as string', () => {
    expect(transformJournal(makeJournal()).reference).toBe('1001')
  })

  it('maps date to postedAt as Date', () => {
    expect(transformJournal(makeJournal()).postedAt).toEqual(new Date('2024-01-31'))
  })

  it('returns undefined postedAt when date is empty', () => {
    expect(transformJournal(makeJournal({ date: '' })).postedAt).toBeUndefined()
  })

  it('maps rows to lineItems', () => {
    const j = transformJournal(makeJournal())
    expect(j.lineItems).toHaveLength(2)

    const debit = j.lineItems![0]
    expect(debit.id).toBe('1')
    expect(debit.accountId).toBe('7000')
    expect(debit.description).toBe('Gross salary')
    expect(debit.debitAmount).toBe(50000)
    expect(debit.creditAmount).toBeUndefined()

    const credit = j.lineItems![1]
    expect(credit.id).toBe('2')
    expect(credit.accountId).toBe('1910')
    expect(credit.creditAmount).toBe(50000)
    expect(credit.debitAmount).toBeUndefined()
  })

  it('returns empty lineItems when rows is empty', () => {
    const j = transformJournal(makeJournal({ rows: [] }))
    expect(j.lineItems).toHaveLength(0)
  })

  it('returns undefined description when empty', () => {
    expect(transformJournal(makeJournal({ description: '' })).description).toBeUndefined()
  })

  it('returns undefined reference when voucherNumber is 0', () => {
    expect(transformJournal(makeJournal({ voucherNumber: 0 })).reference).toBeUndefined()
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
