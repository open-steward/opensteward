import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import { transformTransaction, type MorningIncome } from '../../../../../../../src/verticals/accounting/adapters/morning/transform/transaction'

function makeIncome(overrides: Partial<MorningIncome> = {}): MorningIncome {
  return {
    id: 'income_1',
    date: '2024-03-15',
    amount: 1000,
    currency: 'ILS',
    description: 'Payment received',
    clientId: 'client_5',
    ...overrides,
  }
}

describe('transformTransaction (morning)', () => {
  it('maps core fields correctly', () => {
    const result = transformTransaction(makeIncome())
    expect(result.id).toBe('income_1')
    expect(result.totalAmount).toBe(1000)
    expect(result.currency).toBe('ILS')
    expect(result.memo).toBe('Payment received')
  })

  it('maps clientId to contacts', () => {
    const result = transformTransaction(makeIncome())
    expect(result.contacts).toHaveLength(1)
    expect(result.contacts![0].id).toBe('client_5')
  })

  it('parses date as Date object', () => {
    const result = transformTransaction(makeIncome())
    expect(result.createdAt).toEqual(new Date('2024-03-15'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeIncome()
    const result = transformTransaction(raw)
    expect(result.metadata).toBe(raw)
  })

  it('handles missing clientId', () => {
    const result = transformTransaction(makeIncome({ clientId: undefined }))
    expect(result.contacts).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTransaction(makeIncome())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
