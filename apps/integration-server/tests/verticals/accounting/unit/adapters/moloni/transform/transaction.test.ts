import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import { transformTransaction, type MoloniTransaction } from '../../../../../../../src/verticals/accounting/adapters/moloni/transform/transaction'

function makeTransaction(overrides: Partial<MoloniTransaction> = {}): MoloniTransaction {
  return {
    payment_method_id: 7,
    name: 'Bank Transfer',
    value: 250.5,
    ...overrides,
  }
}

describe('transformTransaction', () => {
  it('maps core fields correctly', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.id).toBe('7')
    expect(result.memo).toBe('Bank Transfer')
    expect(result.totalAmount).toBe(25050)
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeTransaction({ name: 'Cash' })
    const result = transformTransaction(raw)
    expect(result.metadata).toBe(raw)
  })

  it('returns undefined memo when name is empty', () => {
    const result = transformTransaction(makeTransaction({ name: '' }))
    expect(result.memo).toBeUndefined()
  })

  it('maps value of 0 correctly', () => {
    const result = transformTransaction(makeTransaction({ value: 0 }))
    expect(result.totalAmount).toBe(0)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTransaction(makeTransaction())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
