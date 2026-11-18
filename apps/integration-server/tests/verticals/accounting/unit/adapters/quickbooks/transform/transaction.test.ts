import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import {
  transformTransaction,
  type QBOPayment,
} from '../../../../../../../src/verticals/accounting/adapters/quickbooks/transform/transaction'

function makePayment(overrides: Partial<QBOPayment> = {}): QBOPayment {
  return {
    Id: 'pay-1',
    TxnDate: '2024-03-20',
    CustomerRef: { value: 'cust-3' },
    TotalAmt: 1200,
    UnappliedAmt: 0,
    CurrencyRef: { value: 'USD' },
    PaymentMethodRef: { value: 'Check' },
    DepositToAccountRef: { value: 'acct-100' },
    ...overrides,
  }
}

describe('transformTransaction', () => {
  it('maps Id to id correctly', () => {
    expect(transformTransaction(makePayment()).id).toBe('pay-1')
  })

  it('maps DepositToAccountRef.value to accountId', () => {
    expect(transformTransaction(makePayment()).accountId).toBe('acct-100')
  })

  it('maps CurrencyRef.value to currency', () => {
    expect(transformTransaction(makePayment()).currency).toBe('USD')
  })

  it('maps PaymentMethodRef.value to paymentMethod', () => {
    expect(transformTransaction(makePayment()).paymentMethod).toBe('Check')
  })

  it('maps TotalAmt to totalAmount', () => {
    expect(transformTransaction(makePayment()).totalAmount).toBe(1200)
  })

  it('parses TxnDate as Date object for createdAt', () => {
    expect(transformTransaction(makePayment()).createdAt).toEqual(new Date('2024-03-20'))
  })

  it('maps CustomerRef.value to contacts array', () => {
    const result = transformTransaction(makePayment())
    expect(result.contacts).toEqual([{ id: 'cust-3' }])
  })

  it('sets contacts to undefined when CustomerRef is absent', () => {
    const result = transformTransaction(makePayment({ CustomerRef: undefined }))
    expect(result.contacts).toBeUndefined()
  })

  it('sets accountId to undefined when DepositToAccountRef is absent', () => {
    const result = transformTransaction(makePayment({ DepositToAccountRef: undefined }))
    expect(result.accountId).toBeUndefined()
  })

  it('sets paymentMethod to undefined when PaymentMethodRef is absent', () => {
    const result = transformTransaction(makePayment({ PaymentMethodRef: undefined }))
    expect(result.paymentMethod).toBeUndefined()
  })

  it('sets createdAt to undefined when TxnDate is empty', () => {
    expect(transformTransaction(makePayment({ TxnDate: '' })).createdAt).toBeUndefined()
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makePayment()
    expect(transformTransaction(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTransaction(makePayment())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
