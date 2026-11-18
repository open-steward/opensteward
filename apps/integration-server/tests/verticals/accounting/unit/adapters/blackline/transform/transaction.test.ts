import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import { transformTransaction, type BlacklineTransaction } from '../../../../../../../src/verticals/accounting/adapters/blackline/transform/transaction'

function makeTransaction(overrides: Partial<BlacklineTransaction> = {}): BlacklineTransaction {
  return {
    transactionId: 'txn-001',
    description: 'Wire transfer receipt',
    amount: 5000,
    currency: 'USD',
    transactionDate: '2024-03-15',
    accountId: 'acct-001',
    createdAt: '2024-03-15T12:00:00Z',
    modifiedAt: '2024-03-15T12:00:00Z',
    ...overrides,
  }
}

describe('transformTransaction (BlackLine)', () => {
  it('maps id from transactionId', () => {
    expect(transformTransaction(makeTransaction()).id).toBe('txn-001')
  })

  it('maps amount and currency', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.totalAmount).toBe(5000)
    expect(result.currency).toBe('USD')
  })

  it('maps description as memo', () => {
    expect(transformTransaction(makeTransaction()).memo).toBe('Wire transfer receipt')
  })

  it('maps accountId', () => {
    expect(transformTransaction(makeTransaction()).accountId).toBe('acct-001')
  })

  it('parses transactionDate as Date object', () => {
    expect(transformTransaction(makeTransaction()).createdAt).toEqual(new Date('2024-03-15'))
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
