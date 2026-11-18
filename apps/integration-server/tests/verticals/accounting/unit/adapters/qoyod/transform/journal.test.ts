import { describe, it, expect } from 'vitest'
import {
  transformJournal,
  untransformJournal,
  type QoyodJournalEntry,
} from '../../../../../../../src/verticals/accounting/adapters/qoyod/transform/journal'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'

function makeRaw(overrides: Partial<QoyodJournalEntry> = {}): QoyodJournalEntry {
  return {
    id: 800,
    reference: 'JE-2025-001',
    description: 'Opening entry',
    date: '2025-01-01',
    journal_entry_lines: [
      { id: 1, account_id: 100, description: 'Cash debit', debit: 10000, credit: 0 },
      { id: 2, account_id: 200, description: 'Equity credit', debit: 0, credit: 10000 },
    ],
    ...overrides,
  }
}

describe('qoyod transformJournal', () => {
  it('maps numeric id to string', () => {
    expect(transformJournal(makeRaw()).id).toBe('800')
  })

  it('maps description', () => {
    expect(transformJournal(makeRaw()).description).toBe('Opening entry')
  })

  it('maps reference', () => {
    expect(transformJournal(makeRaw()).reference).toBe('JE-2025-001')
  })

  it('maps date to postedAt Date', () => {
    expect(transformJournal(makeRaw()).postedAt).toBeInstanceOf(Date)
  })

  it('maps line account_id to accountId as string', () => {
    expect(transformJournal(makeRaw()).lineItems?.[0]?.accountId).toBe('100')
  })

  it('maps line debit to debitAmount', () => {
    expect(transformJournal(makeRaw()).lineItems?.[0]?.debitAmount).toBe(10000)
  })

  it('maps line credit to creditAmount', () => {
    expect(transformJournal(makeRaw()).lineItems?.[1]?.creditAmount).toBe(10000)
  })

  it('maps line description', () => {
    expect(transformJournal(makeRaw()).lineItems?.[0]?.description).toBe('Cash debit')
  })

  it('passes JournalSchema.parse', () => {
    expect(() => JournalSchema.parse(transformJournal(makeRaw()))).not.toThrow()
  })
})

describe('qoyod untransformJournal round-trip', () => {
  it('maps reference back', () => {
    const jnl = transformJournal(makeRaw())
    const raw = untransformJournal(jnl)
    expect(raw['reference']).toBe('JE-2025-001')
  })

  it('maps description back', () => {
    const jnl = transformJournal(makeRaw())
    const raw = untransformJournal(jnl)
    expect(raw['description']).toBe('Opening entry')
  })

  it('maps lineItems back to journal_entry_lines with numeric account_id', () => {
    const jnl = transformJournal(makeRaw())
    const raw = untransformJournal(jnl)
    const lines = raw['journal_entry_lines'] as Array<Record<string, unknown>>
    expect(lines[0]?.['account_id']).toBe(100)
    expect(lines[0]?.['debit']).toBe(10000)
  })

  it('maps postedAt back to date string', () => {
    const jnl = transformJournal(makeRaw())
    const raw = untransformJournal(jnl)
    expect(raw['date']).toBe('2025-01-01')
  })
})
