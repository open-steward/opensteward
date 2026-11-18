import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import {
  transformTransaction,
  type ProcountorTransaction,
} from '../../../../../../../src/verticals/accounting/adapters/procountor/transform/transaction'

function makeTransaction(overrides: Partial<ProcountorTransaction> = {}): ProcountorTransaction {
  return {
    id: 7001,
    accountNumber: '1910',
    transactionType: 'BANK_TRANSFER',
    currency: 'EUR',
    amount: 15000,
    date: '2024-03-15',
    ...overrides,
  }
}

describe('transformTransaction', () => {
  it('maps id as string', () => {
    expect(transformTransaction(makeTransaction()).id).toBe('7001')
  })

  it('maps accountNumber to accountId', () => {
    expect(transformTransaction(makeTransaction()).accountId).toBe('1910')
  })

  it('maps transactionType to type', () => {
    expect(transformTransaction(makeTransaction()).type).toBe('BANK_TRANSFER')
  })

  it('maps currency', () => {
    expect(transformTransaction(makeTransaction()).currency).toBe('EUR')
  })

  it('maps amount to totalAmount', () => {
    expect(transformTransaction(makeTransaction()).totalAmount).toBe(15000)
  })

  it('maps date to createdAt as Date', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.createdAt?.toISOString().startsWith('2024-03-15')).toBe(true)
  })

  it('returns undefined createdAt when date is empty', () => {
    expect(transformTransaction(makeTransaction({ date: '' })).createdAt).toBeUndefined()
  })

  it('returns undefined accountId when accountNumber is empty', () => {
    expect(transformTransaction(makeTransaction({ accountNumber: '' })).accountId).toBeUndefined()
  })

  it('returns undefined type when transactionType is empty', () => {
    expect(transformTransaction(makeTransaction({ transactionType: '' })).type).toBeUndefined()
  })

  it('returns undefined currency when empty', () => {
    expect(transformTransaction(makeTransaction({ currency: '' })).currency).toBeUndefined()
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
