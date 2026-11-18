import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  type CalxaTransaction,
} from '../../../../../../../src/verticals/accounting/adapters/calxa/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'

function makeTransaction(overrides: Partial<CalxaTransaction> = {}): CalxaTransaction {
  return {
    id: 'txn-001',
    accountId: 'acct-1000',
    type: 'RECEIVE',
    reference: 'INV-1042',
    memo: 'Payment received',
    currency: 'USD',
    subTotal: 1000,
    taxAmount: 100,
    total: 1100,
    date: '2024-03-15',
    ...overrides,
  }
}

describe('transformTransaction', () => {
  it('maps id as-is', () => {
    expect(transformTransaction(makeTransaction()).id).toBe('txn-001')
  })

  it('maps accountId', () => {
    expect(transformTransaction(makeTransaction()).accountId).toBe('acct-1000')
  })

  it('maps type', () => {
    expect(transformTransaction(makeTransaction()).type).toBe('RECEIVE')
  })

  it('maps reference', () => {
    expect(transformTransaction(makeTransaction()).reference).toBe('INV-1042')
  })

  it('maps memo', () => {
    expect(transformTransaction(makeTransaction()).memo).toBe('Payment received')
  })

  it('maps currency', () => {
    expect(transformTransaction(makeTransaction()).currency).toBe('USD')
  })

  it('maps subTotal to subTotalAmount', () => {
    expect(transformTransaction(makeTransaction()).subTotalAmount).toBe(1000)
  })

  it('maps taxAmount', () => {
    expect(transformTransaction(makeTransaction()).taxAmount).toBe(100)
  })

  it('maps total to totalAmount', () => {
    expect(transformTransaction(makeTransaction()).totalAmount).toBe(1100)
  })

  it('maps date to createdAt as Date', () => {
    expect(transformTransaction(makeTransaction()).createdAt).toEqual(new Date('2024-03-15'))
  })

  it('falls back to createdAt field when date is undefined', () => {
    const result = transformTransaction(
      makeTransaction({ date: undefined, createdAt: '2024-01-10T08:00:00Z' }),
    )
    expect(result.createdAt).toEqual(new Date('2024-01-10T08:00:00Z'))
  })

  it('returns undefined createdAt when both date and createdAt are undefined', () => {
    const result = transformTransaction(makeTransaction({ date: undefined, createdAt: undefined }))
    expect(result.createdAt).toBeUndefined()
  })

  it('maps updatedAt to Date', () => {
    const result = transformTransaction(makeTransaction({ updatedAt: '2024-02-01T14:20:00Z' }))
    expect(result.updatedAt).toEqual(new Date('2024-02-01T14:20:00Z'))
  })

  it('returns undefined accountId when accountId is undefined', () => {
    expect(
      transformTransaction(makeTransaction({ accountId: undefined })).accountId,
    ).toBeUndefined()
  })

  it('passes raw object as metadata', () => {
    const raw = makeTransaction()
    expect(transformTransaction(raw).metadata).toBe(raw)
  })

  it('output passes schema validation', () => {
    expect(() => TransactionSchema.parse(transformTransaction(makeTransaction()))).not.toThrow()
  })
})
