import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import {
  transformJournal,
  untransformJournal,
  type BokioJournal,
} from '../../../../../../../src/verticals/accounting/adapters/bokio/transform/journal'
import { JOURNAL_ENTRY, copyOf } from '../fixtures'

const entry = (): BokioJournal => copyOf<BokioJournal>(JOURNAL_ENTRY)

describe('transformJournal (Bokio, documented journalEntry)', () => {
  it('maps the documented example and parses against JournalSchema', () => {
    const out = JournalSchema.parse(transformJournal(entry()))
    expect(out).toMatchObject({
      id: 'a419cf69-db6f-4de9-992c-b1a60942a443',
      description: 'invoice 1234',
      reference: 'V342',
      postedAt: '2024-10-10',
    })
    expect(out.lineItems).toEqual([
      { id: '1', accountId: '1930', debitAmount: 20_000, creditAmount: 0 },
      { id: '2', accountId: '3011', debitAmount: 0, creditAmount: 4_000 },
      { id: '3', accountId: '2611', debitAmount: 0, creditAmount: 16_000 },
    ])
  })

  it('reads items/account/title, not undocumented entries/accountNumber/description', () => {
    const raw = { ...entry(), entries: [{ accountNumber: '9' }], description: 'wrong' }
    const out = JournalSchema.parse(transformJournal(raw))
    expect(out.description).toBe('invoice 1234')
    expect(out.lineItems).toHaveLength(3)
  })

  it('keeps lineItems unset (not []) when the row carries no items', () => {
    const raw = entry()
    delete raw.items
    expect(JournalSchema.parse(transformJournal(raw)).lineItems).toBeUndefined()
  })

  it('keeps the raw row as metadata', () => {
    const raw = entry()
    expect(transformJournal(raw).metadata).toBe(raw)
  })
})

describe('untransformJournal (Bokio POST journal-entries body)', () => {
  it('builds the documented create example from its own canonical form', () => {
    const canonical = JournalSchema.parse(transformJournal(entry()))
    expect(untransformJournal(canonical)).toEqual({
      title: 'invoice 1234',
      date: '2024-10-10',
      items: [
        { account: 1930, debit: 200, credit: 0 },
        { account: 3011, debit: 0, credit: 40 },
        { account: 2611, debit: 0, credit: 160 },
      ],
    })
  })

  it('rejects a line whose accountId is not an account number', () => {
    expect(() =>
      untransformJournal({ lineItems: [{ accountId: 'acct_x', debitAmount: 100 }] }),
    ).toThrow(expect.objectContaining({ statusCode: 400 }))
  })
})
