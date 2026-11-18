import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import { transformTransaction, type AppFolioTransaction } from '../../../../../../../src/verticals/accounting/adapters/appfolio/transform/transaction'

function makeTransaction(overrides: Partial<AppFolioTransaction> = {}): AppFolioTransaction {
  return {
    id: '701',
    date: '2024-03-10',
    description: 'Rent payment received',
    amount: 2500,
    currency: 'USD',
    property_id: 'prop_1',
    lease_id: 'lease_1',
    ...overrides,
  }
}

describe('transformTransaction (AppFolio)', () => {
  it('maps core fields correctly', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.id).toBe('701')
    expect(result.memo).toBe('Rent payment received')
    expect(result.totalAmount).toBe(2500)
    expect(result.currency).toBe('USD')
  })

  it('parses ISO date as Date object', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.createdAt).toEqual(new Date('2024-03-10'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeTransaction()
    const result = transformTransaction(raw)
    expect(result.metadata).toBe(raw)
  })

  it('converts numeric id to string', () => {
    const result = transformTransaction(makeTransaction({ id: 999 }))
    expect(result.id).toBe('999')
  })

  it('handles missing description gracefully', () => {
    const result = transformTransaction(makeTransaction({ description: '' }))
    expect(result.memo).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTransaction(makeTransaction())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
