import { describe, it, expect } from 'vitest'
import {
  transformJournal,
  type RilletJournalEntry,
  type RilletJournalEntryItem,
} from '../../../../../../../src/verticals/accounting/adapters/rillet/transform/journal'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'

function makeDebitItem(overrides: Partial<RilletJournalEntryItem> = {}): RilletJournalEntryItem {
  return {
    id: 'jli_1',
    description: 'Revenue recognition',
    amount: { amount: '500.00', currency: 'USD' },
    account_id: 'acct_4000',
    account_code: '4000',
    side: 'DEBIT',
    ...overrides,
  }
}

function makeCreditItem(overrides: Partial<RilletJournalEntryItem> = {}): RilletJournalEntryItem {
  return {
    id: 'jli_2',
    description: 'Accounts receivable',
    amount: { amount: '500.00', currency: 'USD' },
    account_id: 'acct_1100',
    account_code: '1100',
    side: 'CREDIT',
    ...overrides,
  }
}

function makeJournal(overrides: Partial<RilletJournalEntry> = {}): RilletJournalEntry {
  return {
    id: 'jrnl_9001',
    name: 'Sales revenue recognition — INV-1042',
    currency: 'USD',
    date: '2026-02-01',
    subsidiary_id: 'sub_1',
    items: [makeDebitItem(), makeCreditItem()],
    updated_at: '2026-02-02T10:00:00Z',
    ...overrides,
  }
}

describe('transformJournal', () => {
  it('maps id directly', () => {
    expect(transformJournal(makeJournal()).id).toBe('jrnl_9001')
  })

  it('maps name to description', () => {
    expect(transformJournal(makeJournal()).description).toBe('Sales revenue recognition — INV-1042')
  })

  it('maps currency directly', () => {
    expect(transformJournal(makeJournal()).currency).toBe('USD')
  })

  it('maps date to postedAt Date', () => {
    expect(transformJournal(makeJournal()).postedAt).toEqual(new Date('2026-02-01'))
  })

  it('maps updated_at to updatedAt Date', () => {
    expect(transformJournal(makeJournal()).updatedAt).toEqual(new Date('2026-02-02T10:00:00Z'))
  })

  it('produces two lineItems from two items', () => {
    expect(transformJournal(makeJournal()).lineItems).toHaveLength(2)
  })

  it('maps DEBIT side item: sets debitAmount, leaves creditAmount undefined', () => {
    const j = transformJournal(makeJournal())
    const debit = j.lineItems![0]
    expect(debit.id).toBe('jli_1')
    expect(debit.accountId).toBe('acct_4000')
    expect(debit.description).toBe('Revenue recognition')
    // "500.00" → 50000
    expect(debit.debitAmount).toBe(50000)
    expect(debit.creditAmount).toBeUndefined()
    expect(debit.totalAmount).toBe(50000)
  })

  it('maps CREDIT side item: sets creditAmount, leaves debitAmount undefined', () => {
    const j = transformJournal(makeJournal())
    const credit = j.lineItems![1]
    expect(credit.id).toBe('jli_2')
    expect(credit.accountId).toBe('acct_1100')
    // "500.00" → 50000
    expect(credit.creditAmount).toBe(50000)
    expect(credit.debitAmount).toBeUndefined()
    expect(credit.totalAmount).toBe(50000)
  })

  it('handles empty items array gracefully', () => {
    const j = transformJournal(makeJournal({ items: [] }))
    expect(j.lineItems).toEqual([])
  })

  it('passes raw object as metadata (reference equality)', () => {
    const raw = makeJournal()
    expect(transformJournal(raw).metadata).toBe(raw)
  })

  it('produces output that passes JournalSchema validation', () => {
    const result = transformJournal(makeJournal())
    expect(() => JournalSchema.parse(result)).not.toThrow()
  })

  it('does not scale a zero-decimal currency (JPY) by 100', () => {
    const amount = { amount: '50000', currency: 'JPY' }
    const journal = makeJournal({
      currency: 'JPY',
      items: [makeDebitItem({ amount }), makeCreditItem({ amount })],
    })
    const out = JournalSchema.parse(transformJournal(journal))
    expect(out.lineItems?.[0]?.debitAmount).toBe(50000)
    expect(out.lineItems?.[1]?.creditAmount).toBe(50000)
  })

  it('scales a three-decimal currency (KWD) by 1000', () => {
    const amount = { amount: '1.250', currency: 'KWD' }
    const journal = makeJournal({
      currency: 'KWD',
      items: [makeDebitItem({ amount }), makeCreditItem({ amount })],
    })
    const out = JournalSchema.parse(transformJournal(journal))
    expect(out.lineItems?.[0]?.debitAmount).toBe(1250)
    expect(out.lineItems?.[1]?.creditAmount).toBe(1250)
    expect(out.lineItems?.[0]?.totalAmount).toBe(1250)
  })
})
