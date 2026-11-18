import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  type AfasTransaction,
} from '../../../../../../../src/verticals/accounting/adapters/afas/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'

function makeRaw(overrides: Partial<AfasTransaction> = {}): AfasTransaction {
  return {
    TransactionNr: 'TXN-001',
    AccountNr: '4000',
    RelationId: 'DEB-001',
    RelationName: 'Acme BV',
    Description: 'Invoice payment',
    Amount: 250,
    CurrencyId: 'EUR',
    TransDate: '2024-01-20',
    DocumentNr: 'INV-100',
    ...overrides,
  }
}

describe('transformTransaction (afas)', () => {
  it('maps core fields correctly', () => {
    const result = transformTransaction(makeRaw())
    expect(result.id).toBe('TXN-001')
    expect(result.accountId).toBe('4000')
    expect(result.reference).toBe('INV-100')
    expect(result.currency).toBe('EUR')
    // Amount=250 → toMinorUnits → 25000
    expect(result.totalAmount).toBe(25000)
  })

  it('maps relation as contact', () => {
    const result = transformTransaction(makeRaw())
    expect(result.contacts).toBeDefined()
    expect(result.contacts![0].id).toBe('DEB-001')
    expect(result.contacts![0].name).toBe('Acme BV')
  })

  it('parses TransDate as Date object', () => {
    const result = transformTransaction(makeRaw())
    expect(result.createdAt).toEqual(new Date('2024-01-20'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformTransaction(raw)
    expect(result.metadata).toBe(raw)
  })

  it('passes TransactionSchema.parse without throwing', () => {
    const result = transformTransaction(makeRaw())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
