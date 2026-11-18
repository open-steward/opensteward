import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import {
  transformTransaction,
  type BillyBankPayment,
} from '../../../../../../../src/verticals/accounting/adapters/billy/transform/transaction'

function makeBankPayment(overrides: Partial<BillyBankPayment> = {}): BillyBankPayment {
  return {
    id: 'bp-001',
    entryDate: '2024-03-15',
    cashAmount: 12500,
    cashSide: 'debit',
    cashAccountId: 'acc-1920',
    currencyId: 'DKK',
    cashExchangeRate: 1,
    feeAmount: 50,
    ...overrides,
  }
}

describe('transformTransaction', () => {
  it('maps id from raw id', () => {
    expect(transformTransaction(makeBankPayment()).id).toBe('bp-001')
  })

  it('maps cashAccountId to accountId', () => {
    expect(transformTransaction(makeBankPayment()).accountId).toBe('acc-1920')
  })

  it('maps cashSide to type', () => {
    expect(transformTransaction(makeBankPayment()).type).toBe('debit')
  })

  it('maps currencyId to currency', () => {
    expect(transformTransaction(makeBankPayment()).currency).toBe('DKK')
  })

  it('maps cashAmount to totalAmount', () => {
    expect(transformTransaction(makeBankPayment()).totalAmount).toBe(12500)
  })

  it('maps entryDate to createdAt as Date', () => {
    const result = transformTransaction(makeBankPayment())
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.createdAt?.toISOString().startsWith('2024-03-15')).toBe(true)
  })

  it('returns undefined createdAt when entryDate is empty', () => {
    expect(transformTransaction(makeBankPayment({ entryDate: '' })).createdAt).toBeUndefined()
  })

  it('passes raw object as metadata', () => {
    const raw = makeBankPayment()
    expect(transformTransaction(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTransaction(makeBankPayment())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
