import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import { transformTransaction, type FATransaction } from '../../../../../../../src/verticals/accounting/adapters/frontaccounting/transform/transaction'

function makeRaw(overrides: Partial<FATransaction> = {}): FATransaction {
  return {
    id: 200,
    reference: 'TXN-2024-001',
    tran_date: '2024-01-15',
    account: '1100',
    memo: 'Bank deposit',
    amount: 5000,
    ...overrides,
  }
}

describe('transformTransaction (FrontAccounting)', () => {
  it('maps core fields correctly', () => {
    const result = transformTransaction(makeRaw())
    expect(result.id).toBe('200')
    expect(result.reference).toBe('TXN-2024-001')
    expect(result.accountId).toBe('1100')
    expect(result.memo).toBe('Bank deposit')
    expect(result.totalAmount).toBe(5000)
  })

  it('parses date as Date object', () => {
    const result = transformTransaction(makeRaw())
    expect(result.createdAt).toEqual(new Date('2024-01-15'))
  })

  it('sets metadata to raw object', () => {
    const raw = makeRaw()
    expect(transformTransaction(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTransaction(makeRaw())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
