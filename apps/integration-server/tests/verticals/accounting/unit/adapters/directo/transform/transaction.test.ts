import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  type DirectoReceipt,
} from '../../../../../../../src/verticals/accounting/adapters/directo/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'

function makeRaw(overrides: Partial<DirectoReceipt> = {}): DirectoReceipt {
  return {
    number: '7001',
    date: '2024-07-01',
    customercode: 'CUST01',
    customername: 'Acme Corp',
    currency: 'EUR',
    sum: 1210,
    account: 'BANK',
    reference: 'PAY-001',
    description: 'Invoice payment',
    type: 'RECEIPT',
    rows: [{ rn: 1, account: 'BANK', sum: 1210, description: 'Bank receipt' }],
    ...overrides,
  }
}

describe('directo transformTransaction', () => {
  it('maps number to id as string', () => {
    const result = transformTransaction(makeRaw({ number: 111 }))
    expect(result.id).toBe('111')
  })

  it('maps account to accountId', () => {
    const result = transformTransaction(makeRaw({ account: 'CASH' }))
    expect(result.accountId).toBe('CASH')
  })

  it('maps type', () => {
    const result = transformTransaction(makeRaw({ type: 'RECEIPT' }))
    expect(result.type).toBe('RECEIPT')
  })

  it('maps customercode to contacts[0].id', () => {
    const result = transformTransaction(makeRaw({ customercode: 'C10' }))
    expect(result.contacts?.[0]?.id).toBe('C10')
  })

  it('uses suppliercode when customercode absent', () => {
    const result = transformTransaction(
      makeRaw({ customercode: undefined, suppliercode: 'S55', suppliername: 'Supplier Inc' }),
    )
    expect(result.contacts?.[0]?.id).toBe('S55')
  })

  it('maps description to memo', () => {
    const result = transformTransaction(makeRaw({ description: 'My memo' }))
    expect(result.memo).toBe('My memo')
  })

  it('maps reference', () => {
    const result = transformTransaction(makeRaw({ reference: 'REF-XYZ' }))
    expect(result.reference).toBe('REF-XYZ')
  })

  it('maps date to createdAt as Date', () => {
    const result = transformTransaction(makeRaw({ date: '2024-08-20' }))
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('maps row to lineItems', () => {
    const result = transformTransaction(makeRaw())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems?.[0]?.accountId).toBe('BANK')
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
