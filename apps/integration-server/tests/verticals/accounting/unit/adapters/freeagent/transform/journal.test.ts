import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import {
  transformJournal,
  type FreeAgentJournalEntry,
} from '../../../../../../../src/verticals/accounting/adapters/freeagent/transform/journal'

function makeJournalEntry(overrides: Partial<FreeAgentJournalEntry> = {}): FreeAgentJournalEntry {
  return {
    url: 'https://api.freeagent.com/v2/journal_entries/88',
    dated_on: '2024-06-01',
    description: 'Salary accrual',
    debit_account: 'https://api.freeagent.com/v2/ledger_accounts/7210',
    credit_account: 'https://api.freeagent.com/v2/ledger_accounts/1930',
    debit_value: '5000.00',
    credit_value: '5000.00',
    ...overrides,
  }
}

describe('transformJournal', () => {
  it('extracts id from url', () => {
    expect(transformJournal(makeJournalEntry()).id).toBe('88')
  })

  it('maps description correctly', () => {
    expect(transformJournal(makeJournalEntry()).description).toBe('Salary accrual')
  })

  it('parses dated_on as postedAt Date', () => {
    expect(transformJournal(makeJournalEntry()).postedAt).toEqual(new Date('2024-06-01'))
  })

  it('creates two lineItems for debit and credit', () => {
    const j = transformJournal(makeJournalEntry())
    expect(j.lineItems).toHaveLength(2)
  })

  it('maps debit lineitem correctly', () => {
    const j = transformJournal(makeJournalEntry())
    const debit = j.lineItems![0]
    expect(debit.accountId).toBe('7210')
    expect(debit.debitAmount).toBe(5000)
    expect(debit.creditAmount).toBeUndefined()
  })

  it('maps credit lineitem correctly', () => {
    const j = transformJournal(makeJournalEntry())
    const credit = j.lineItems![1]
    expect(credit.accountId).toBe('1930')
    expect(credit.creditAmount).toBe(5000)
    expect(credit.debitAmount).toBeUndefined()
  })

  it('returns undefined postedAt when dated_on is empty', () => {
    expect(transformJournal(makeJournalEntry({ dated_on: '' })).postedAt).toBeUndefined()
  })

  it('passes raw object as metadata', () => {
    const raw = makeJournalEntry()
    expect(transformJournal(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformJournal(makeJournalEntry())
    expect(() => JournalSchema.parse(result)).not.toThrow()
  })
})
