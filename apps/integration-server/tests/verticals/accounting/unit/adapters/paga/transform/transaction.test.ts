import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import { transformTransaction, type PagaTransaction } from '../../../../../../../src/verticals/accounting/adapters/paga/transform/transaction'

function makeRaw(overrides: Partial<PagaTransaction> = {}): PagaTransaction {
  return {
    transactionId: 'TX-001',
    reference: 'REF-001',
    description: 'Payment for goods',
    amount: 1500,
    currency: 'NGN',
    status: 'SUCCESSFUL',
    type: 'TRANSFER',
    transactionDate: '2024-10-20',
    ...overrides,
  }
}

describe('paga transformTransaction', () => {
  it('maps transactionId to id', () => {
    expect(transformTransaction(makeRaw()).id).toBe('TX-001')
  })

  it('falls back to reference as id when transactionId absent', () => {
    expect(transformTransaction(makeRaw({ transactionId: undefined })).id).toBe('REF-001')
  })

  it('maps reference to reference', () => {
    expect(transformTransaction(makeRaw()).reference).toBe('REF-001')
  })

  it('maps type to type', () => {
    expect(transformTransaction(makeRaw()).type).toBe('TRANSFER')
  })

  it('maps currency to currency', () => {
    expect(transformTransaction(makeRaw()).currency).toBe('NGN')
  })

  it('defaults currency to NGN when absent', () => {
    expect(transformTransaction(makeRaw({ currency: undefined })).currency).toBe('NGN')
  })

  it('maps amount to totalAmount', () => {
    expect(transformTransaction(makeRaw()).totalAmount).toBe(1500)
  })

  it('maps transactionDate to createdAt as Date', () => {
    expect(transformTransaction(makeRaw()).createdAt).toEqual(new Date('2024-10-20'))
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformTransaction(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformTransaction(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTransaction(makeRaw())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
