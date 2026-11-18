import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import { transformTransaction, type MyobBankTransaction } from '../../../../../../../src/verticals/accounting/adapters/myob/transform/transaction'

function makeTxn(overrides: Partial<MyobBankTransaction> = {}): MyobBankTransaction {
  return { UID: 'uid-6', Date: '2024-05-01', TotalAmount: 2000, Account: { UID: 'bank-1' }, Memo: 'Payment', ...overrides }
}

describe('transformTransaction (myob)', () => {
  it('maps id and accountId', () => {
    expect(transformTransaction(makeTxn()).id).toBe('uid-6')
    expect(transformTransaction(makeTxn()).accountId).toBe('bank-1')
  })
  it('maps totalAmount and memo', () => {
    expect(transformTransaction(makeTxn()).totalAmount).toBe(2000)
    expect(transformTransaction(makeTxn()).memo).toBe('Payment')
  })
  it('maps createdAt', () => { expect(transformTransaction(makeTxn()).createdAt).toEqual(new Date('2024-05-01')) })
  it('passes raw as metadata', () => {
    const raw = makeTxn()
    expect(transformTransaction(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTransaction(makeTxn())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
