import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  type FakturowniaPayment,
} from '../../../../../../../src/verticals/accounting/adapters/fakturownia/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'

function makeRaw(overrides: Partial<FakturowniaPayment> = {}): FakturowniaPayment {
  return {
    id: 5001,
    name: 'Payment from Acme',
    price: 246.0,
    kind: 'transfer',
    paid: true,
    invoice_id: 4001,
    currency: 'PLN',
    paid_date: '2024-08-10',
    ...overrides,
  }
}

describe('fakturownia transformTransaction', () => {
  it('maps id to string', () => {
    const result = transformTransaction(makeRaw({ id: 77 }))
    expect(result.id).toBe('77')
  })

  it('major-unit price → minor units', () => {
    const result = transformTransaction(makeRaw({ price: 12.34 }))
    expect(result.totalAmount).toBe(1234)
  })

  it('maps kind to type unchanged', () => {
    const result = transformTransaction(makeRaw({ kind: 'transfer' }))
    expect(result.type).toBe('transfer')
  })

  it('maps invoice_id to reference as string', () => {
    const result = transformTransaction(makeRaw({ invoice_id: 4001 }))
    expect(result.reference).toBe('4001')
  })

  it('falls back to invoice_ids[0] when invoice_id null', () => {
    const result = transformTransaction(makeRaw({ invoice_id: null, invoice_ids: [9001, 9002] }))
    expect(result.reference).toBe('9001')
  })

  it('maps name to memo', () => {
    const result = transformTransaction(makeRaw({ name: 'Q3 payment' }))
    expect(result.memo).toBe('Q3 payment')
  })

  it('maps currency', () => {
    const result = transformTransaction(makeRaw({ currency: 'EUR' }))
    expect(result.currency).toBe('EUR')
  })

  it('maps paid_date to createdAt as Date', () => {
    const result = transformTransaction(makeRaw({ paid_date: '2024-09-01' }))
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('no contacts or lineItems in output', () => {
    // Fakturownia payment transform does not populate contacts/lineItems
    const result = transformTransaction(makeRaw())
    expect(result.contacts).toBeUndefined()
    expect(result.lineItems).toBeUndefined()
  })

  it('metadata is the raw object', () => {
    const raw = makeRaw()
    const result = transformTransaction(raw)
    expect(result.metadata).toBe(raw)
  })

  it('passes TransactionSchema.parse without throwing', () => {
    const result = transformTransaction(makeRaw())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
