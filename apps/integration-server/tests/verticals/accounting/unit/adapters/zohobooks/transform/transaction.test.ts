import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import {
  transformTransaction,
  type ZohoBooksTransaction,
} from '../../../../../../../src/verticals/accounting/adapters/zohobooks/transform/transaction'

function makeTransaction(overrides: Partial<ZohoBooksTransaction> = {}): ZohoBooksTransaction {
  return {
    transaction_id: 'txn-001',
    transaction_date: '2024-10-01',
    account_id: 'acct-200',
    account_name: 'Checking Account',
    transaction_type: 'invoice_payment',
    debit_or_credit: 'debit',
    offset_account_name: 'Accounts Receivable',
    currency_code: 'USD',
    debit_amount: 750,
    credit_amount: 0,
    ...overrides,
  }
}

describe('transformTransaction', () => {
  it('maps transaction_id to id', () => {
    expect(transformTransaction(makeTransaction()).id).toBe('txn-001')
  })

  it('maps account_id to accountId', () => {
    expect(transformTransaction(makeTransaction()).accountId).toBe('acct-200')
  })

  it('maps transaction_type to type', () => {
    expect(transformTransaction(makeTransaction()).type).toBe('invoice_payment')
  })

  it('maps currency_code to currency', () => {
    expect(transformTransaction(makeTransaction()).currency).toBe('USD')
  })

  it('maps debit_amount to totalAmount when debit_amount is non-zero', () => {
    expect(transformTransaction(makeTransaction({ debit_amount: 750, credit_amount: 0 })).totalAmount).toBe(750)
  })

  it('maps credit_amount to totalAmount when debit_amount is zero', () => {
    expect(transformTransaction(makeTransaction({ debit_amount: 0, credit_amount: 500 })).totalAmount).toBe(500)
  })

  it('parses transaction_date as createdAt Date object', () => {
    expect(transformTransaction(makeTransaction()).createdAt).toEqual(new Date('2024-10-01'))
  })

  it('sets currency to undefined when currency_code is empty', () => {
    expect(transformTransaction(makeTransaction({ currency_code: '' })).currency).toBeUndefined()
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeTransaction()
    expect(transformTransaction(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTransaction(makeTransaction())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
