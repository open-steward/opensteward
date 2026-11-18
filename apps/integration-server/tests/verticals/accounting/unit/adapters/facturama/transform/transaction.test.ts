import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import { transformTransaction, type FacturamaTransaction } from '../../../../../../../src/verticals/accounting/adapters/facturama/transform/transaction'

function makeRaw(overrides: Partial<FacturamaTransaction> = {}): FacturamaTransaction {
  return {
    Id: 'txn-1',
    AccountCode: 'acc-1',
    Type: 'Payment',
    Reference: 'REF-001',
    Currency: 'MXN',
    Amount: 500,
    Date: '2024-08-01',
    ClientId: '',
    ClientName: '',
    Lines: [],
    ...overrides,
  }
}

describe('facturama transformTransaction', () => {
  it('maps Id to id', () => {
    expect(transformTransaction(makeRaw()).id).toBe('txn-1')
  })
  it('handles fields gracefully', () => {
    expect(() => transformTransaction(makeRaw())).not.toThrow()
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformTransaction(raw).metadata).toBe(raw)
  })
  it('maps Date to createdAt as Date', () => {
    expect(transformTransaction(makeRaw()).createdAt).toEqual(new Date('2024-08-01'))
  })
  it('maps ClientId to contacts when non-empty', () => {
    const result = transformTransaction(makeRaw({ ClientId: 'cust-1', ClientName: 'Test' }))
    expect(result.contacts).toHaveLength(1)
    expect(result.contacts![0].id).toBe('cust-1')
  })
  it('maps Type to type', () => {
    expect(transformTransaction(makeRaw()).type).toBe('Payment')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTransaction(makeRaw())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
