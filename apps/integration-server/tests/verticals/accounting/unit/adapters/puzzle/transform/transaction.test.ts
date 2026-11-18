import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  type PuzzleTransaction,
} from '../../../../../../../src/verticals/accounting/adapters/puzzle/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'

function makeRaw(overrides: Partial<PuzzleTransaction> = {}): PuzzleTransaction {
  return {
    id: 'txn-pzl-1',
    descriptor: 'AWS Invoice',
    timestamp: '2025-05-20T10:00:00.000Z',
    amountAsMoney: { amount: '250.00', currency: 'USD' },
    memo: 'Cloud infrastructure',
    nativeId: 'native-txn-42',
    accountId: 'bank-acct-1',
    vendorId: 'vendor-9',
    status: 'Finalized',
    ...overrides,
  }
}

describe('puzzle transformTransaction', () => {
  it('maps id', () => {
    expect(transformTransaction(makeRaw()).id).toBe('txn-pzl-1')
  })

  it('maps accountId', () => {
    expect(transformTransaction(makeRaw()).accountId).toBe('bank-acct-1')
  })

  it('maps nativeId to reference', () => {
    expect(transformTransaction(makeRaw()).reference).toBe('native-txn-42')
  })

  it('maps memo (prefers memo over descriptor)', () => {
    expect(transformTransaction(makeRaw()).memo).toBe('Cloud infrastructure')
  })

  it('falls back to descriptor when memo absent', () => {
    expect(transformTransaction(makeRaw({ memo: undefined })).memo).toBe('AWS Invoice')
  })

  it('maps amountAsMoney currency', () => {
    expect(transformTransaction(makeRaw()).currency).toBe('USD')
  })

  it('converts amount to minor units', () => {
    expect(transformTransaction(makeRaw()).totalAmount).toBe(25000)
  })

  it('maps timestamp to createdAt Date', () => {
    expect(transformTransaction(makeRaw()).createdAt).toBeInstanceOf(Date)
  })

  it('maps vendorId to contacts when no customerId', () => {
    const result = transformTransaction(makeRaw())
    expect(result.contacts?.[0]?.id).toBe('vendor-9')
  })

  it('maps customerId to contacts (takes priority over vendorId)', () => {
    const result = transformTransaction(makeRaw({ customerId: 'cust-5' }))
    expect(result.contacts?.[0]?.id).toBe('cust-5')
  })

  it('passes TransactionSchema.parse', () => {
    expect(() => TransactionSchema.parse(transformTransaction(makeRaw()))).not.toThrow()
  })
})
