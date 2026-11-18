import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import {
  transformTransaction,
  type NetvisorTransaction,
} from '../../../../../../../src/verticals/accounting/adapters/netvisor/transform/transaction'

function makeTransaction(overrides: Partial<NetvisorTransaction> = {}): NetvisorTransaction {
  return {
    NetvisorKey: 77001,
    AccountNumber: '1920',
    TransactionType: 'debit',
    Currency: 'EUR',
    Amount: 15000,
    TransactionDate: '2024-03-15',
    ...overrides,
  }
}

describe('transformTransaction', () => {
  it('maps NetvisorKey to id as string', () => {
    expect(transformTransaction(makeTransaction()).id).toBe('77001')
  })

  it('maps AccountNumber to accountId as string', () => {
    expect(transformTransaction(makeTransaction()).accountId).toBe('1920')
  })

  it('maps TransactionType to type', () => {
    expect(transformTransaction(makeTransaction()).type).toBe('debit')
  })

  it('maps Currency to currency', () => {
    expect(transformTransaction(makeTransaction()).currency).toBe('EUR')
  })

  it('maps Amount to totalAmount', () => {
    expect(transformTransaction(makeTransaction()).totalAmount).toBe(15000)
  })

  it('maps TransactionDate to createdAt as Date', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.createdAt?.toISOString().startsWith('2024-03-15')).toBe(true)
  })

  it('returns undefined createdAt when TransactionDate is empty', () => {
    expect(
      transformTransaction(makeTransaction({ TransactionDate: '' })).createdAt,
    ).toBeUndefined()
  })

  it('returns undefined type when TransactionType is empty', () => {
    expect(
      transformTransaction(makeTransaction({ TransactionType: '' })).type,
    ).toBeUndefined()
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
