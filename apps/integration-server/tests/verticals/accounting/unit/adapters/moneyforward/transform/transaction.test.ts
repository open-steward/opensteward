import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import { transformTransaction, type MoneyForwardBankAccountTransaction } from '../../../../../../../src/verticals/accounting/adapters/moneyforward/transform/transaction'

function makeRaw(overrides: Partial<MoneyForwardBankAccountTransaction> = {}): MoneyForwardBankAccountTransaction {
  return {
    id: 'txn-001',
    bank_account_id: 'bank-abc',
    transaction_date: '2024-06-20',
    amount: 25000,
    description: 'Wire transfer received',
    balance: 125000,
    ...overrides,
  }
}

describe('transformTransaction (moneyforward)', () => {
  it('maps core fields correctly', () => {
    const result = transformTransaction(makeRaw())
    expect(result.id).toBe('txn-001')
    expect(result.accountId).toBe('bank-abc')
    expect(result.totalAmount).toBe(25000)
    expect(result.memo).toBe('Wire transfer received')
  })

  it('parses transaction_date as Date object', () => {
    const result = transformTransaction(makeRaw())
    expect(result.createdAt).toEqual(new Date('2024-06-20'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformTransaction(raw)
    expect(result.metadata).toBe(raw)
  })

  it('creates lineitem from transaction', () => {
    const result = transformTransaction(makeRaw())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].totalAmount).toBe(25000)
    expect(result.lineItems![0].description).toBe('Wire transfer received')
  })

  it('handles null description', () => {
    const result = transformTransaction(makeRaw({ description: null }))
    expect(result.memo).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTransaction(makeRaw())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
