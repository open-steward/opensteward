import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import { transformTransaction, type SilverfinTransaction } from '../../../../../../../src/verticals/accounting/adapters/silverfin/transform/transaction'

function makeTransaction(overrides: Partial<SilverfinTransaction> = {}): SilverfinTransaction {
  return {
    id: '700',
    period: '2024-03-15',
    description: 'Bank transfer',
    value: 5000,
    currency: 'EUR',
    ...overrides,
  }
}

describe('transformTransaction (Silverfin)', () => {
  it('maps core fields correctly', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.id).toBe('700')
    expect(result.memo).toBe('Bank transfer')
    expect(result.totalAmount).toBe(5000)
    expect(result.currency).toBe('EUR')
  })

  it('parses period as createdAt Date', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.createdAt).toEqual(new Date('2024-03-15'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeTransaction()
    const result = transformTransaction(raw)
    expect(result.metadata).toBe(raw)
  })

  it('returns undefined memo when description is empty', () => {
    const result = transformTransaction(makeTransaction({ description: '' }))
    expect(result.memo).toBeUndefined()
  })

  it('returns undefined currency when currency is empty', () => {
    const result = transformTransaction(makeTransaction({ currency: '' }))
    expect(result.currency).toBeUndefined()
  })

  it('returns undefined createdAt when period is empty', () => {
    const result = transformTransaction(makeTransaction({ period: '' }))
    expect(result.createdAt).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTransaction(makeTransaction())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
