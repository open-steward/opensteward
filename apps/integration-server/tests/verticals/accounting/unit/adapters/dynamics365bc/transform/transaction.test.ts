import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import { transformTransaction, type BCBankTransaction } from '../../../../../../../src/verticals/accounting/adapters/dynamics365bc/transform/transaction'

function makeTransaction(overrides: Partial<BCBankTransaction> = {}): BCBankTransaction {
  return {
    id: 'txn-1',
    bankAccountId: 'bank-1',
    bankAccountNumber: 'ACC123',
    transactionDate: '2024-03-15',
    amount: 1500,
    description: 'Payment received',
    documentNumber: 'DOC-001',
    ...overrides,
  }
}

describe('transformTransaction (dynamics365bc)', () => {
  it('maps id and accountId', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.id).toBe('txn-1')
    expect(result.accountId).toBe('bank-1')
  })

  it('maps totalAmount', () => {
    expect(transformTransaction(makeTransaction({ amount: 2000 })).totalAmount).toBe(2000)
  })

  it('maps memo from description', () => {
    expect(transformTransaction(makeTransaction()).memo).toBe('Payment received')
  })

  it('maps reference from documentNumber', () => {
    expect(transformTransaction(makeTransaction()).reference).toBe('DOC-001')
  })

  it('maps createdAt from transactionDate', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.createdAt).toEqual(new Date('2024-03-15'))
  })

  it('passes raw object as metadata', () => {
    const raw = makeTransaction()
    expect(transformTransaction(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTransaction(makeTransaction())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
