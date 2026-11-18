import { describe, it, expect } from 'vitest'
import {
  transformCreditMemo,
  untransformCreditMemo,
  type BigcapitalCreditNote,
  type BigcapitalCreditNoteEntry,
} from '../../../../../../../src/verticals/accounting/adapters/bigcapital/transform/creditmemo'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'

const sampleEntries: BigcapitalCreditNoteEntry[] = [
  { index: 1, itemId: 5, rate: 100, quantity: 1, description: 'Returned item' },
]

function makeRaw(overrides: Partial<BigcapitalCreditNote> = {}): BigcapitalCreditNote {
  return {
    id: 20,
    creditNoteNumber: 'CN-020',
    creditNoteDate: '2024-02-01',
    customerId: 7,
    currencyCode: 'USD',
    creditNoteMessage: 'Credit for returned goods',
    referenceNo: 'REF-001',
    entries: sampleEntries,
    total: 100,
    balance: 100,
    status: 'OPEN',
    createdAt: '2024-02-01T00:00:00.000Z',
    updatedAt: '2024-02-05T00:00:00.000Z',
    ...overrides,
  }
}

describe('transformCreditMemo (bigcapital)', () => {
  it('maps core fields correctly', () => {
    const result = transformCreditMemo(makeRaw())
    expect(result.id).toBe('20')
    expect(result.creditmemoNumber).toBe('CN-020')
    expect(result.contactId).toBe('7')
    expect(result.currency).toBe('USD')
    // total=100 → toMinor → 10000
    expect(result.totalAmount).toBe(10000)
    expect(result.balanceAmount).toBe(10000)
    expect(result.notes).toBe('Credit for returned goods')
  })

  it('parses creditNoteDate as Date', () => {
    const result = transformCreditMemo(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-02-01'))
  })

  it('maps OPEN status to AUTHORIZED', () => {
    const result = transformCreditMemo(makeRaw({ status: 'OPEN' }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps CLOSED status to PAID', () => {
    const result = transformCreditMemo(makeRaw({ status: 'CLOSED' }))
    expect(result.status).toBe('PAID')
  })

  it('maps VOIDED status to VOIDED', () => {
    const result = transformCreditMemo(makeRaw({ status: 'VOIDED' }))
    expect(result.status).toBe('VOIDED')
  })

  it('maps entries to lineItems', () => {
    const result = transformCreditMemo(makeRaw())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('1')
    expect(li.itemId).toBe('5')
    expect(li.itemDescription).toBe('Returned item')
    // rate=100 → toMinor → 10000
    expect(li.unitAmount).toBe(10000)
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformCreditMemo(raw)
    expect(result.metadata).toBe(raw)
  })

  it('passes CreditMemoSchema.parse without throwing', () => {
    const result = transformCreditMemo(makeRaw())
    expect(() => CreditMemoSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformCreditMemo (contactId, currency)', () => {
    const canonical = transformCreditMemo(makeRaw())
    const back = untransformCreditMemo(canonical)
    expect(back['customerId']).toBe(7)
    expect(back['currencyCode']).toBe('USD')
    expect(back['creditNoteMessage']).toBe('Credit for returned goods')
  })
})
