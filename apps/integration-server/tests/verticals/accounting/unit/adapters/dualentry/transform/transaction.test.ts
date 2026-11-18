import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  type DualentryPayment,
} from '../../../../../../../src/verticals/accounting/adapters/dualentry/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'

function makeRaw(overrides: Partial<DualentryPayment> = {}): DualentryPayment {
  return {
    id: 600,
    date: '2024-09-01',
    transaction_date: '2024-09-01',
    company_id: 1,
    contact_id: 10,
    contact_name: 'Acme Corp',
    account_id: 1001,
    currency_iso_4217_code: 'EUR',
    amount: '500.00',
    memo: 'Invoice payment',
    reference_number: 'PAY-001',
    payment_method: 'bank_transfer',
    payment_type: 'incoming',
    record_status: 'posted',
    ...overrides,
  }
}

describe('dualentry transformTransaction', () => {
  it('maps id to string', () => {
    const result = transformTransaction(makeRaw({ id: 77 }))
    expect(result.id).toBe('77')
  })

  it('payment_type=incoming → type PAYMENT_IN', () => {
    const result = transformTransaction(makeRaw({ payment_type: 'incoming' }))
    expect(result.type).toBe('PAYMENT_IN')
  })

  it('payment_type=outgoing → type PAYMENT_OUT', () => {
    const result = transformTransaction(makeRaw({ payment_type: 'outgoing' }))
    expect(result.type).toBe('PAYMENT_OUT')
  })

  it('maps amount string → minor units', () => {
    const result = transformTransaction(makeRaw({ amount: '12.34' }))
    expect(result.totalAmount).toBe(1234)
  })

  it('maps contact_id (no prefix) to contacts[0].id', () => {
    // DualEntry transaction uses raw contact_id (no cust_/vend_ prefix)
    const result = transformTransaction(makeRaw({ contact_id: 10 }))
    expect(result.contacts?.[0]?.id).toBe('10')
  })

  it('maps account_id to accountId as string', () => {
    const result = transformTransaction(makeRaw({ account_id: 1001 }))
    expect(result.accountId).toBe('1001')
  })

  it('builds one lineitem from account_id and memo', () => {
    const result = transformTransaction(makeRaw())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems?.[0]?.accountId).toBe('1001')
  })

  it('maps date to createdAt as Date', () => {
    const result = transformTransaction(makeRaw({ date: '2024-09-01' }))
    expect(result.createdAt).toBeInstanceOf(Date)
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
