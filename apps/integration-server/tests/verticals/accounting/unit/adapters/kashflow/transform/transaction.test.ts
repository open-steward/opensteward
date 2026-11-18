import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  type KashflowBankTransaction,
} from '../../../../../../../src/verticals/accounting/adapters/kashflow/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'

function makeTransaction(
  overrides: Partial<KashflowBankTransaction> = {},
): KashflowBankTransaction {
  return {
    Id: 99,
    AccountId: 10,
    PaidIn: 100,
    PaidOut: 0,
    Comment: 'Customer payment',
    Payee: 'Acme Ltd',
    Type: 'Sale - INV001',
    TransactionNumber: 'TXN-001',
    Date: '2024-02-15',
    ...overrides,
  }
}

describe('transformTransaction', () => {
  it('maps Id to id as string', () => {
    expect(transformTransaction(makeTransaction({ Id: 99 })).id).toBe('99')
  })

  it('maps string Id to id', () => {
    expect(transformTransaction(makeTransaction({ Id: 'txn-abc' })).id).toBe('txn-abc')
  })

  it('maps AccountId to accountId as string', () => {
    expect(transformTransaction(makeTransaction({ AccountId: 10 })).accountId).toBe('10')
  })

  it('maps Type to type', () => {
    expect(transformTransaction(makeTransaction({ Type: 'Sale - INV001' })).type).toBe(
      'Sale - INV001',
    )
  })

  it('maps TransactionNumber to reference when present', () => {
    expect(transformTransaction(makeTransaction({ TransactionNumber: 'TXN-001' })).reference).toBe(
      'TXN-001',
    )
  })

  it('falls back to ResourceNumber for reference when TransactionNumber is absent', () => {
    const result = transformTransaction(
      makeTransaction({ TransactionNumber: undefined, ResourceNumber: 'RES-002' }),
    )
    expect(result.reference).toBe('RES-002')
  })

  it('maps Comment to memo when present', () => {
    expect(
      transformTransaction(makeTransaction({ Comment: 'Customer payment', Payee: 'Acme Ltd' }))
        .memo,
    ).toBe('Customer payment')
  })

  it('falls back to Payee for memo when Comment is absent', () => {
    const result = transformTransaction(makeTransaction({ Comment: undefined, Payee: 'Acme Ltd' }))
    expect(result.memo).toBe('Acme Ltd')
  })

  it('computes positive totalAmount from PaidIn (money in)', () => {
    // PaidIn=100 → toMinorUnits(100)=10000; PaidOut=0 → 0; net=10000
    const result = transformTransaction(makeTransaction({ PaidIn: 100, PaidOut: 0 }))
    expect(result.totalAmount).toBe(10000)
  })

  it('computes negative totalAmount from PaidOut (money out)', () => {
    // PaidIn=0 → 0; PaidOut=50 → toMinorUnits(50)=5000; net=0-5000=-5000
    const result = transformTransaction(makeTransaction({ PaidIn: 0, PaidOut: 50 }))
    expect(result.totalAmount).toBe(-5000)
  })

  it('computes net signed amount when both PaidIn and PaidOut are set', () => {
    // PaidIn=100 → 10000, PaidOut=30 → 3000; net=7000
    const result = transformTransaction(makeTransaction({ PaidIn: 100, PaidOut: 30 }))
    expect(result.totalAmount).toBe(7000)
  })

  it('returns undefined totalAmount when both PaidIn and PaidOut are absent', () => {
    const result = transformTransaction(makeTransaction({ PaidIn: undefined, PaidOut: undefined }))
    expect(result.totalAmount).toBeUndefined()
  })

  it('produces a single line item mirroring the transaction', () => {
    const result = transformTransaction(
      makeTransaction({ PaidIn: 100, PaidOut: 0, AccountId: 10, Comment: 'Customer payment' }),
    )
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.accountId).toBe('10')
    expect(li.description).toBe('Customer payment')
    expect(li.totalAmount).toBe(10000)
  })

  it('line item description falls back to Payee when Comment is absent', () => {
    const result = transformTransaction(makeTransaction({ Comment: undefined, Payee: 'Acme Ltd' }))
    expect(result.lineItems![0].description).toBe('Acme Ltd')
  })

  it('uses Date field for createdAt when present', () => {
    const result = transformTransaction(
      makeTransaction({ Date: '2024-02-15', TransactionDate: undefined }),
    )
    expect(result.createdAt).toBeDefined()
  })

  it('falls back to TransactionDate when Date is absent', () => {
    const result = transformTransaction(
      makeTransaction({ Date: undefined, TransactionDate: '2024-02-20' }),
    )
    expect(result.createdAt).toBeDefined()
  })

  it('does not set updatedAt', () => {
    expect(transformTransaction(makeTransaction()).updatedAt).toBeUndefined()
  })

  it('passes raw object as metadata', () => {
    const raw = makeTransaction()
    expect(transformTransaction(raw).metadata).toBe(raw)
  })

  it('produces output that passes TransactionSchema validation', () => {
    const result = transformTransaction(makeTransaction())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
