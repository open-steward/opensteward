import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import { transformTransaction, type ExactBankTransaction } from '../../../../../../../src/verticals/accounting/adapters/exactonline/transform/transaction'

function makeTxn(overrides: Partial<ExactBankTransaction> = {}): ExactBankTransaction {
  return { ID: 't-1', BankAccount: 'ba-1', Date: '2024-05-01', Amount: 800, Description: 'Incoming', Currency: 'EUR', ...overrides }
}

describe('transformTransaction (exactonline)', () => {
  it('maps id, accountId', () => {
    const r = transformTransaction(makeTxn())
    expect(r.id).toBe('t-1')
    expect(r.accountId).toBe('ba-1')
  })
  it('maps totalAmount', () => {
    expect(transformTransaction(makeTxn()).totalAmount).toBe(800)
  })
  it('maps memo', () => {
    expect(transformTransaction(makeTxn()).memo).toBe('Incoming')
  })
  it('maps createdAt', () => {
    expect(transformTransaction(makeTxn()).createdAt).toEqual(new Date('2024-05-01'))
  })
  it('passes raw as metadata', () => {
    const raw = makeTxn()
    expect(transformTransaction(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTransaction(makeTxn())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
