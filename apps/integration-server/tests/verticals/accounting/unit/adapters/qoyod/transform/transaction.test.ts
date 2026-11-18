import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  type QoyodPayment,
} from '../../../../../../../src/verticals/accounting/adapters/qoyod/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'

function makeRaw(overrides: Partial<QoyodPayment> = {}): QoyodPayment {
  return {
    id: 1200,
    reference: 'PAY-REF-001',
    customer_id: 300,
    customer_name: 'Customer Corp',
    invoice_id: 700,
    date: '2025-06-10',
    amount: 2300,
    currency: 'SAR',
    payment_method: 'bank_transfer',
    account_id: 50,
    notes: 'Full payment received',
    ...overrides,
  }
}

describe('qoyod transformTransaction', () => {
  it('maps numeric id to string', () => {
    expect(transformTransaction(makeRaw()).id).toBe('1200')
  })

  it('maps account_id to accountId as string', () => {
    expect(transformTransaction(makeRaw()).accountId).toBe('50')
  })

  it('maps payment_method to type', () => {
    expect(transformTransaction(makeRaw()).type).toBe('bank_transfer')
  })

  it('uses invoice_id as reference when present', () => {
    expect(transformTransaction(makeRaw()).reference).toBe('700')
  })

  it('falls back to reference field when invoice_id absent', () => {
    expect(transformTransaction(makeRaw({ invoice_id: null })).reference).toBe('PAY-REF-001')
  })

  it('maps currency', () => {
    expect(transformTransaction(makeRaw()).currency).toBe('SAR')
  })

  it('maps amount directly (no ×100 conversion)', () => {
    expect(transformTransaction(makeRaw()).totalAmount).toBe(2300)
  })

  it('maps customer_id and customer_name to contacts', () => {
    const result = transformTransaction(makeRaw())
    expect(result.contacts?.[0]?.id).toBe('300')
    expect(result.contacts?.[0]?.name).toBe('Customer Corp')
  })

  it('omits contacts when customer_id absent', () => {
    const result = transformTransaction(makeRaw({ customer_id: null }))
    expect(result.contacts).toBeUndefined()
  })

  it('maps date to createdAt Date', () => {
    expect(transformTransaction(makeRaw()).createdAt).toBeInstanceOf(Date)
  })

  it('includes one lineitem with account and totalAmount', () => {
    const result = transformTransaction(makeRaw())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems?.[0]?.accountId).toBe('50')
    expect(result.lineItems?.[0]?.totalAmount).toBe(2300)
  })

  it('passes TransactionSchema.parse', () => {
    expect(() => TransactionSchema.parse(transformTransaction(makeRaw()))).not.toThrow()
  })
})
