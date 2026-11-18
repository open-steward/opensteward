import { describe, it, expect } from 'vitest'
import {
  transformExpense,
  type DualentryDirectExpense,
} from '../../../../../../../src/verticals/accounting/adapters/dualentry/transform/expense'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'

function makeRaw(overrides: Partial<DualentryDirectExpense> = {}): DualentryDirectExpense {
  return {
    id: 50,
    internal_id: 50,
    number: 5001,
    date: '2024-05-15',
    transaction_date: '2024-05-15',
    company_id: 1,
    company_name: 'My Company',
    company_currency: 'EUR',
    vendor_id: 20,
    vendor_name: 'Office Depot',
    account_number: 6000,
    currency_iso_4217_code: 'EUR',
    exchange_rate: '1.00',
    amount: '99.99',
    bank_or_credit_card_amount: null,
    memo: 'Office supplies',
    check_number: null,
    payment_method_id: null,
    record_status: 'posted',
    items: [],
    ...overrides,
  }
}

describe('dualentry transformExpense', () => {
  it('maps id to string', () => {
    const result = transformExpense(makeRaw({ id: 77 }))
    expect(result.id).toBe('77')
  })

  it('maps vendor_id with vend_ prefix to contactId', () => {
    const result = transformExpense(makeRaw({ vendor_id: 20 }))
    expect(result.contactId).toBe('vend_20')
  })

  it('maps account_number to accountId as string', () => {
    const result = transformExpense(makeRaw({ account_number: 6000 }))
    expect(result.accountId).toBe('6000')
  })

  it('amount string → minor units', () => {
    const result = transformExpense(makeRaw({ amount: '50.00' }))
    expect(result.totalAmount).toBe(5000)
  })

  it('maps date to postedAt as Date', () => {
    const result = transformExpense(makeRaw({ date: '2024-05-15' }))
    expect(result.postedAt).toBeInstanceOf(Date)
  })

  it('null vendor_id → contactId undefined', () => {
    const result = transformExpense(makeRaw({ vendor_id: null }))
    expect(result.contactId).toBeUndefined()
  })

  it('maps currency', () => {
    const result = transformExpense(makeRaw({ currency_iso_4217_code: 'USD' }))
    expect(result.currency).toBe('USD')
  })

  it('metadata is the raw object', () => {
    const raw = makeRaw()
    const result = transformExpense(raw)
    expect(result.metadata).toBe(raw)
  })

  it('passes ExpenseSchema.parse without throwing', () => {
    const result = transformExpense(makeRaw())
    expect(() => ExpenseSchema.parse(result)).not.toThrow()
  })
})
