import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import { transformTransaction, type MekariJurnalTransaction } from '../../../../../../../src/verticals/accounting/adapters/mekarijurnal/transform/transaction'

function makeTransaction(overrides: Partial<MekariJurnalTransaction> = {}): MekariJurnalTransaction {
  return {
    id: 55,
    transaction_date: '2024-04-15',
    description: 'Payment received',
    amount: 2500000,
    currency_code: 'IDR',
    ...overrides,
  }
}

describe('transformTransaction (mekarijurnal)', () => {
  it('maps core fields correctly', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.id).toBe('55')
    expect(result.memo).toBe('Payment received')
    expect(result.totalAmount).toBe(2500000)
    expect(result.currency).toBe('IDR')
  })

  it('parses transaction_date as Date object', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.createdAt).toEqual(new Date('2024-04-15'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeTransaction()
    const result = transformTransaction(raw)
    expect(result.metadata).toBe(raw)
  })

  it('handles null description', () => {
    const result = transformTransaction(makeTransaction({ description: null }))
    expect(result.memo).toBeUndefined()
  })

  it('handles null currency_code', () => {
    const result = transformTransaction(makeTransaction({ currency_code: null }))
    expect(result.currency).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTransaction(makeTransaction())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
