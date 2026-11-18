/**
 * Fixture: an `EntryDetail` built from the spec's schema
 * (https://developer.digits.com/openapi/openapi.yaml). `amount` is a
 * `Currency`: "Amount is expressed in minor units - $5.00 is 500¢." The
 * entry's amount and category mirror the guide's sync example
 * (https://developer.digits.com/docs/chart-of-accounts.md):
 * `"amount": { "amount": 50000, "code": "USD" }, "type": "Debit"`.
 */
import { describe, it, expect } from 'vitest'
import {
  transformEntryDetail,
  type DigitsEntryDetail,
} from '../../../../../../../src/verticals/accounting/adapters/digits/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'

const DETAIL: DigitsEntryDetail = {
  transactionId: 'txn-9001',
  transactionType: 'PayOut',
  date: '2025-04-10T00:00:00Z',
  createdAt: '2025-04-11T08:00:00Z',
  updatedAt: '2025-04-12T09:00:00Z',
  entry: {
    id: 'entry-1',
    amount: { amount: 50000, code: 'USD' },
    type: 'Debit',
    description: 'Office supplies purchase',
    category: {
      id: 'c8ce7e10-32c0-4cec-8993-12276f219039',
      name: 'Office Supplies',
      type: 'Expenses',
    },
    counterparty: { id: { issuer: 'digits.com', id: 'party-1' }, name: 'Staples' },
  },
}

describe('transformEntryDetail (digits)', () => {
  it('maps one entry to one transaction keyed by the entry id', () => {
    const out = TransactionSchema.parse(transformEntryDetail(DETAIL))
    expect(out.id).toBe('entry-1')
    expect(out.accountId).toBe('c8ce7e10-32c0-4cec-8993-12276f219039')
    expect(out.type).toBe('PayOut')
    expect(out.memo).toBe('Office supplies purchase')
    expect(out.contacts).toEqual([{ id: 'party-1', name: 'Staples' }])
    expect(out.postedAt).toEqual(new Date('2025-04-10T00:00:00Z'))
    expect(out.createdAt).toEqual(new Date('2025-04-11T08:00:00Z'))
    expect(out.updatedAt).toEqual(new Date('2025-04-12T09:00:00Z'))
    expect(out.metadata?.['transactionId']).toBe('txn-9001')
  })

  it('amount is already minor units: 50000 stays 50000', () => {
    const out = TransactionSchema.parse(transformEntryDetail(DETAIL))
    expect(out.totalAmount).toBe(50000)
    expect(out.currency).toBe('USD')
  })

  it('omits amount and currency when the Currency is incomplete', () => {
    const out = TransactionSchema.parse(
      transformEntryDetail({ ...DETAIL, entry: { ...DETAIL.entry, amount: { amount: 100 } } }),
    )
    expect(out.totalAmount).toBeUndefined()
    expect(out.currency).toBeUndefined()
    expect('totalAmount' in transformEntryDetail({ ...DETAIL, entry: { id: 'e' } })).toBe(false)
  })

  it('no counterparty → no contacts', () => {
    const out = TransactionSchema.parse(
      transformEntryDetail({ ...DETAIL, entry: { ...DETAIL.entry, counterparty: undefined } }),
    )
    expect(out.contacts).toBeUndefined()
  })

  it('throws on a detail with no entry.id', () => {
    expect(() => transformEntryDetail({ ...DETAIL, entry: { description: 'x' } })).toThrow(
      /no entry\.id/,
    )
  })
})
