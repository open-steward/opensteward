import { describe, it, expect } from 'vitest'
import {
  transformJournal,
  untransformJournal,
  type CampfireJournalEntry,
  type CampfireJournalTransaction,
} from '../../../../../../../src/verticals/accounting/adapters/campfire/transform/journal'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'

function makeTransaction(
  overrides: Partial<CampfireJournalTransaction> = {},
): CampfireJournalTransaction {
  return {
    id: 1,
    account: 4000,
    account_name: 'Sales Revenue',
    debit_amount: 100.0,
    credit_amount: 0.0,
    amount: 100.0,
    note: 'Sales entry',
    vendor: 7,
    ...overrides,
  }
}

function makeJournal(overrides: Partial<CampfireJournalEntry> = {}): CampfireJournalEntry {
  return {
    id: 200,
    date: '2024-03-01',
    memo: 'Sales revenue recognition',
    currency: 'USD',
    source: 'invoice',
    ref_number: 'INV-1042',
    created_at: '2024-02-28T08:00:00Z',
    last_modified_at: '2024-03-01T09:00:00Z',
    transactions: [],
    ...overrides,
  }
}

describe('transformJournal', () => {
  it('maps id to string when journal_id is absent', () => {
    expect(transformJournal(makeJournal()).id).toBe('200')
  })

  it('prefers journal_id over numeric id', () => {
    expect(transformJournal(makeJournal({ journal_id: 'JE-XYZ' })).id).toBe('JE-XYZ')
  })

  it('maps memo to description', () => {
    expect(transformJournal(makeJournal()).description).toBe('Sales revenue recognition')
  })

  it('maps ref_number to reference', () => {
    expect(transformJournal(makeJournal()).reference).toBe('INV-1042')
  })

  it('maps source', () => {
    expect(transformJournal(makeJournal()).source).toBe('invoice')
  })

  it('maps currency', () => {
    expect(transformJournal(makeJournal()).currency).toBe('USD')
  })

  it('maps date to postedAt Date', () => {
    expect(transformJournal(makeJournal()).postedAt).toEqual(new Date('2024-03-01'))
  })

  it('maps created_at to createdAt Date', () => {
    expect(transformJournal(makeJournal()).createdAt).toEqual(new Date('2024-02-28T08:00:00Z'))
  })

  it('maps last_modified_at to updatedAt Date', () => {
    expect(transformJournal(makeJournal()).updatedAt).toEqual(new Date('2024-03-01T09:00:00Z'))
  })

  it('maps transactions to lineItems with amount conversion', () => {
    const raw = makeJournal({ transactions: [makeTransaction()] })
    const result = transformJournal(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('1')
    expect(li.accountId).toBe('4000')
    expect(li.contactId).toBe('7')
    expect(li.description).toBe('Sales entry')
    expect(li.debitAmount).toBe(10000)
    expect(li.creditAmount).toBe(0)
    expect(li.totalAmount).toBe(10000)
  })

  it('prefers transaction_id over numeric id in lineItems', () => {
    const raw = makeJournal({ transactions: [makeTransaction({ transaction_id: 'TX-ABC' })] })
    expect(transformJournal(raw).lineItems![0].id).toBe('TX-ABC')
  })

  it('defaults to empty lineItems when transactions is absent', () => {
    const result = transformJournal(makeJournal({ transactions: undefined }))
    expect(result.lineItems).toEqual([])
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
  it('maps postedAt to date as ISO date string', () => {
    const result = untransformJournal({ postedAt: new Date('2024-03-01T00:00:00Z') })
    expect(result.date).toBe('2024-03-01')
  })

  it('maps description to memo', () => {
    expect(untransformJournal({ description: 'Sales recognition' }).memo).toBe('Sales recognition')
  })

  it('maps currency', () => {
    expect(untransformJournal({ currency: 'USD' }).currency).toBe('USD')
  })

  it('converts debitAmount from minor units to decimal dollars in transactions', () => {
    const result = untransformJournal({
      lineItems: [{ debitAmount: 10000, creditAmount: 0 }],
    })
    const txs = result.transactions as Array<Record<string, unknown>>
    expect(txs[0].debit_amount).toBe(100)
    expect(txs[0].credit_amount).toBe(0)
  })

  it('maps accountId back to account as number in transactions', () => {
    const result = untransformJournal({
      lineItems: [{ accountId: '4000', debitAmount: 5000 }],
    })
    const txs = result.transactions as Array<Record<string, unknown>>
    expect(txs[0].account).toBe(4000)
  })

  it('maps contactId back to vendor as number in transactions', () => {
    const result = untransformJournal({
      lineItems: [{ contactId: '7', debitAmount: 5000 }],
    })
    const txs = result.transactions as Array<Record<string, unknown>>
    expect(txs[0].vendor).toBe(7)
  })

  it('round-trips debitAmount through transform then untransform', () => {
    const canonical = transformJournal(
      makeJournal({ transactions: [makeTransaction({ debit_amount: 75.25 })] }),
    )
    expect(canonical.lineItems![0].debitAmount).toBe(7525)
    const back = untransformJournal({ lineItems: canonical.lineItems }) as {
      transactions: Array<{ debit_amount: number }>
    }
    expect(back.transactions[0].debit_amount).toBe(75.25)
  })
})
