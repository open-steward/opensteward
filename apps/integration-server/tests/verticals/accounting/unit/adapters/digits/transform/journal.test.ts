/**
 * Fixture: a ledger `Transaction` built from the spec's schema
 * (https://developer.digits.com/openapi/openapi.yaml): transactionId,
 * transactionType, memo, referenceNumber, amount (Currency, minor units),
 * date, entries ("Individual entries / lines that comprise the transaction.").
 */
import { describe, it, expect } from 'vitest'
import {
  transformLedgerTransaction,
  type DigitsLedgerTransaction,
} from '../../../../../../../src/verticals/accounting/adapters/digits/transform/journal'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'

const TXN: DigitsLedgerTransaction = {
  transactionId: 'txn-9001',
  transactionType: 'JournalEntry',
  memo: 'Accrue March rent',
  referenceNumber: 'JE-42',
  amount: { amount: 250000, code: 'USD' },
  date: '2025-03-31T00:00:00Z',
  entries: [
    {
      id: 'entry-1',
      amount: { amount: 250000, code: 'USD' },
      type: 'Debit',
      description: 'Rent expense',
      category: { id: 'cat-rent' },
      counterparty: { id: { issuer: 'digits.com', id: 'party-landlord' }, name: 'Landlord LLC' },
    },
    {
      id: 'entry-2',
      amount: { amount: 250000, code: 'USD' },
      type: 'Credit',
      description: 'Accrued expenses',
      category: { id: 'cat-accrued' },
    },
  ],
}

describe('transformLedgerTransaction (digits)', () => {
  it('maps the documented Transaction fields', () => {
    const out = JournalSchema.parse(transformLedgerTransaction(TXN))
    expect(out.id).toBe('txn-9001')
    expect(out.description).toBe('Accrue March rent')
    expect(out.reference).toBe('JE-42')
    expect(out.source).toBe('JournalEntry')
    expect(out.currency).toBe('USD')
    expect(out.postedAt).toEqual(new Date('2025-03-31T00:00:00Z'))
  })

  it('puts each entry on the side its type names, in minor units unscaled', () => {
    const out = JournalSchema.parse(transformLedgerTransaction(TXN))
    expect(out.lineItems).toEqual([
      {
        id: 'entry-1',
        accountId: 'cat-rent',
        contactId: 'party-landlord',
        description: 'Rent expense',
        debitAmount: 250000,
      },
      {
        id: 'entry-2',
        accountId: 'cat-accrued',
        description: 'Accrued expenses',
        creditAmount: 250000,
      },
    ])
  })

  it('an Unknown entry type lands on neither side', () => {
    const out = JournalSchema.parse(
      transformLedgerTransaction({
        ...TXN,
        entries: [{ id: 'e', type: 'Unknown', amount: { amount: 5, code: 'USD' } }],
      }),
    )
    expect(out.lineItems?.[0]?.debitAmount).toBeUndefined()
    expect(out.lineItems?.[0]?.creditAmount).toBeUndefined()
  })

  it('throws on a transaction with no transactionId', () => {
    expect(() => transformLedgerTransaction({ ...TXN, transactionId: undefined })).toThrow(
      /no transactionId/,
    )
  })
})
