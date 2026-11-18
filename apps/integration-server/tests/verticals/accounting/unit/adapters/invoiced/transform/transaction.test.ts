import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  type InvoicedPayment,
} from '../../../../../../../src/verticals/accounting/adapters/invoiced/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'

function makePayment(overrides: Partial<InvoicedPayment> = {}): InvoicedPayment {
  return {
    id: 8001,
    object: 'payment',
    customer: 99,
    amount: 12000,
    balance: 0,
    currency: 'usd',
    date: 1700000000,
    method: 'ach',
    reference: 'REF-001',
    notes: 'Payment received for INV-1042',
    voided: false,
    source: null,
    metadata: {},
    created_at: 1700000000,
    updated_at: 1700100000,
    ...overrides,
  }
}

describe('transformTransaction', () => {
  it('converts numeric id to string', () => {
    expect(transformTransaction(makePayment({ id: 8001 })).id).toBe('8001')
  })

  it('maps method to type', () => {
    expect(transformTransaction(makePayment({ method: 'ach' })).type).toBe('ach')
  })

  it('sets type to undefined when method is null', () => {
    expect(transformTransaction(makePayment({ method: null })).type).toBeUndefined()
  })

  it('maps reference', () => {
    expect(transformTransaction(makePayment({ reference: 'REF-001' })).reference).toBe('REF-001')
  })

  it('sets reference to undefined when null', () => {
    expect(transformTransaction(makePayment({ reference: null })).reference).toBeUndefined()
  })

  it('maps notes to memo', () => {
    expect(transformTransaction(makePayment({ notes: 'Payment received' })).memo).toBe(
      'Payment received',
    )
  })

  it('sets memo to undefined when notes is null', () => {
    expect(transformTransaction(makePayment({ notes: null })).memo).toBeUndefined()
  })

  it('maps method to paymentMethod', () => {
    expect(transformTransaction(makePayment({ method: 'ach' })).paymentMethod).toBe('ach')
  })

  it('uppercases currency', () => {
    expect(transformTransaction(makePayment({ currency: 'usd' })).currency).toBe('USD')
  })

  it('maps amount to totalAmount', () => {
    expect(transformTransaction(makePayment({ amount: 12000 })).totalAmount).toBe(12000)
  })

  it('maps customer to contacts array', () => {
    const result = transformTransaction(makePayment({ customer: 99 }))
    expect(result.contacts).toEqual([{ id: '99' }])
  })

  it('always emits a lineItems array with one entry', () => {
    const result = transformTransaction(makePayment({ amount: 12000, method: 'ach' }))
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems?.[0]?.totalAmount).toBe(12000)
    expect(result.lineItems?.[0]?.name).toBe('ach')
  })

  it('sets lineitem name to undefined when method is null', () => {
    const result = transformTransaction(makePayment({ method: null }))
    expect(result.lineItems?.[0]?.name).toBeUndefined()
  })

  it('uses date for createdAt when date is present', () => {
    const result = transformTransaction(makePayment({ date: 1700000000, created_at: 1699000000 }))
    expect(result.createdAt).toEqual(new Date(1700000000 * 1000))
  })

  it('falls back to created_at for createdAt when date is null', () => {
    const result = transformTransaction(makePayment({ date: null, created_at: 1699000000 }))
    expect(result.createdAt).toEqual(new Date(1699000000 * 1000))
  })

  it('sets createdAt to undefined when both date and created_at are null/0', () => {
    const result = transformTransaction(makePayment({ date: null, created_at: 0 }))
    expect(result.createdAt).toBeUndefined()
  })

  it('converts epoch seconds to Date for updatedAt', () => {
    const result = transformTransaction(makePayment({ updated_at: 1700100000 }))
    expect(result.updatedAt).toEqual(new Date(1700100000 * 1000))
  })

  it('passes raw object as metadata', () => {
    const raw = makePayment()
    expect(transformTransaction(raw).metadata).toBe(raw)
  })

  it('passes TransactionSchema validation', () => {
    const result = transformTransaction(makePayment())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
