import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import { transformTransaction, type Unit4Transaction } from '../../../../../../../src/verticals/accounting/adapters/unit4/transform/transaction'

function makeTransaction(overrides: Partial<Unit4Transaction> = {}): Unit4Transaction {
  return {
    transactionId: 'txn_001',
    postingDate: '2024-03-15',
    description: 'Supplier payment',
    amount: 12000,
    currencyCode: 'EUR',
    supplierId: 'supp_10',
    ...overrides,
  }
}

describe('transformTransaction (Unit4)', () => {
  it('maps transactionId to string id', () => {
    expect(transformTransaction(makeTransaction({ transactionId: 'txn_001' })).id).toBe('txn_001')
  })

  it('maps numeric transactionId to string', () => {
    expect(transformTransaction(makeTransaction({ transactionId: 77 })).id).toBe('77')
  })

  it('maps description to memo', () => {
    expect(transformTransaction(makeTransaction()).memo).toBe('Supplier payment')
  })

  it('maps amount to totalAmount', () => {
    expect(transformTransaction(makeTransaction({ amount: 8000 })).totalAmount).toBe(8000)
  })

  it('maps currencyCode to currency', () => {
    expect(transformTransaction(makeTransaction({ currencyCode: 'GBP' })).currency).toBe('GBP')
  })

  it('maps supplierId to contacts array', () => {
    const result = transformTransaction(makeTransaction({ supplierId: 'supp_55' }))
    expect(result.contacts).toHaveLength(1)
    expect(result.contacts![0].id).toBe('supp_55')
  })

  it('parses postingDate as Date', () => {
    expect(transformTransaction(makeTransaction({ postingDate: '2024-03-15' })).createdAt).toEqual(new Date('2024-03-15'))
  })

  it('passes raw object as metadata by reference', () => {
    const raw = makeTransaction()
    expect(transformTransaction(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTransaction(makeTransaction({ transactionId: 'txn_001' }))
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
