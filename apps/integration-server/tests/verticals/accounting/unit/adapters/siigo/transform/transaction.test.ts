import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import { transformTransaction, type SiigoTransaction } from '../../../../../../../src/verticals/accounting/adapters/siigo/transform/transaction'

function makeTransaction(overrides: Partial<SiigoTransaction> = {}): SiigoTransaction {
  return {
    id: 2000,
    accountId: 10,
    type: 'payment',
    reference: 'PAY-2025-001',
    currency: 'COP',
    total: 5000,
    date: '2025-05-20',
    contactId: 300,
    contactName: 'Juan Perez',
    entries: [
      { accountId: 10, description: 'Payment received', amount: 5000, type: 'credit' },
    ],
    ...overrides,
  }
}

describe('transformTransaction', () => {
  it('maps core fields correctly', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.id).toBe('2000')
    expect(result.accountId).toBe('10')
    expect(result.type).toBe('payment')
    expect(result.reference).toBe('PAY-2025-001')
    expect(result.currency).toBe('COP')
    expect(result.totalAmount).toBe(5000)
  })

  it('maps contacts', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.contacts).toHaveLength(1)
    expect(result.contacts![0].id).toBe('300')
    expect(result.contacts![0].name).toBe('Juan Perez')
  })

  it('returns undefined contacts when no contactId', () => {
    const result = transformTransaction(makeTransaction({ contactId: 0 }))
    expect(result.contacts).toBeUndefined()
  })

  it('maps line items from entries', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems?.[0].accountId).toBe('10')
    expect(result.lineItems?.[0].totalAmount).toBe(5000)
  })

  it('maps date to createdAt', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.createdAt).toEqual(new Date('2025-05-20'))
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
