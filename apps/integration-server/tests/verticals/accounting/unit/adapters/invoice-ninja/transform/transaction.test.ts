import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  type InvoiceNinjaPayment,
} from '../../../../../../../src/verticals/accounting/adapters/invoice-ninja/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'

function makePayment(overrides: Partial<InvoiceNinjaPayment> = {}): InvoiceNinjaPayment {
  return {
    id: 'payment-1',
    client_id: 'client-42',
    type_id: '1',
    date: '2024-03-15',
    transaction_reference: 'REF-12345',
    private_notes: 'Payment received via wire',
    amount: 5000,
    refunded: 0,
    currency_id: '1', // USD
    paymentables: [
      { invoice_id: 'inv-100', amount: 3000 },
      { invoice_id: 'inv-101', amount: 2000 },
    ],
    created_at: 1700000000,
    updated_at: 1700100000,
    ...overrides,
  }
}

describe('transformTransaction', () => {
  it('maps id', () => {
    expect(transformTransaction(makePayment()).id).toBe('payment-1')
  })

  it('maps type from type_id as string', () => {
    expect(transformTransaction(makePayment({ type_id: '1' })).type).toBe('1')
  })

  it('returns undefined type when type_id is absent', () => {
    expect(transformTransaction(makePayment({ type_id: null })).type).toBeUndefined()
  })

  it('maps reference from transaction_reference', () => {
    expect(transformTransaction(makePayment()).reference).toBe('REF-12345')
  })

  it('returns undefined reference when transaction_reference is absent', () => {
    expect(
      transformTransaction(makePayment({ transaction_reference: null })).reference,
    ).toBeUndefined()
  })

  it('maps memo from private_notes', () => {
    expect(transformTransaction(makePayment()).memo).toBe('Payment received via wire')
  })

  it('maps currency_id=1 to USD', () => {
    expect(transformTransaction(makePayment()).currency).toBe('USD')
  })

  it('maps totalAmount from amount', () => {
    expect(transformTransaction(makePayment()).totalAmount).toBe(5000)
  })

  it('maps contacts from client_id', () => {
    const result = transformTransaction(makePayment())
    expect(result.contacts).toHaveLength(1)
    expect(result.contacts![0]).toEqual({ id: 'client-42' })
  })

  it('returns undefined contacts when client_id is absent', () => {
    const result = transformTransaction(makePayment({ client_id: null }))
    expect(result.contacts).toBeUndefined()
  })

  it('maps lineItems from paymentables', () => {
    const result = transformTransaction(makePayment())
    expect(result.lineItems).toHaveLength(2)
    expect(result.lineItems![0]).toEqual({ accountId: 'inv-100', totalAmount: 3000 })
    expect(result.lineItems![1]).toEqual({ accountId: 'inv-101', totalAmount: 2000 })
  })

  it('falls back to single lineitem with totalAmount when paymentables is empty', () => {
    const result = transformTransaction(makePayment({ paymentables: [], amount: 5000 }))
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0]).toEqual({ totalAmount: 5000 })
  })

  it('falls back to single lineitem when paymentables is null', () => {
    const result = transformTransaction(makePayment({ paymentables: null, amount: 5000 }))
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0]).toEqual({ totalAmount: 5000 })
  })

  it('maps createdAt from date string when present', () => {
    const result = transformTransaction(makePayment({ date: '2024-03-15', created_at: 1700000000 }))
    expect(result.createdAt).toEqual(new Date('2024-03-15'))
  })

  it('falls back to epoch for createdAt when date is absent', () => {
    const result = transformTransaction(makePayment({ date: null, created_at: 1700000000 }))
    expect(result.createdAt).toEqual(new Date(1700000000 * 1000))
  })

  it('maps updatedAt from epoch (×1000)', () => {
    expect(transformTransaction(makePayment()).updatedAt).toEqual(new Date(1700100000 * 1000))
  })

  it('passes raw object as metadata', () => {
    const raw = makePayment()
    expect(transformTransaction(raw).metadata).toBe(raw)
  })

  it('passes TransactionSchema validation', () => {
    expect(() => TransactionSchema.parse(transformTransaction(makePayment()))).not.toThrow()
  })
})
