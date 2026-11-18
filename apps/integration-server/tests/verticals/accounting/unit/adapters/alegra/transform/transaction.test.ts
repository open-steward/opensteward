import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import { transformTransaction, type AlegraTransaction } from '../../../../../../../src/verticals/accounting/adapters/alegra/transform/transaction'

function makeTransaction(overrides: Partial<AlegraTransaction> = {}): AlegraTransaction {
  return {
    id: 90,
    accountId: 1001,
    type: 'payment',
    reference: 'PAY-001',
    currency: 'COP',
    total: 10000,
    date: '2024-01-15',
    contactId: 3,
    contactName: 'Cliente XYZ',
    entries: [],
    ...overrides,
  }
}

describe('transformTransaction', () => {
  it('maps id to string', () => {
    expect(transformTransaction(makeTransaction()).id).toBe('90')
  })

  it('maps accountId to string', () => {
    expect(transformTransaction(makeTransaction()).accountId).toBe('1001')
  })

  it('maps type', () => {
    expect(transformTransaction(makeTransaction()).type).toBe('payment')
  })

  it('maps reference', () => {
    expect(transformTransaction(makeTransaction()).reference).toBe('PAY-001')
  })

  it('maps currency', () => {
    expect(transformTransaction(makeTransaction()).currency).toBe('COP')
  })

  it('maps total to totalAmount', () => {
    expect(transformTransaction(makeTransaction()).totalAmount).toBe(10000)
  })

  it('maps date as Date object', () => {
    expect(transformTransaction(makeTransaction()).createdAt).toEqual(new Date('2024-01-15'))
  })

  it('maps contactId and contactName to contacts', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.contacts).toHaveLength(1)
    expect(result.contacts![0].id).toBe('3')
    expect(result.contacts![0].name).toBe('Cliente XYZ')
  })

  it('maps entries to lineItems', () => {
    const raw = makeTransaction({
      entries: [{ accountId: 4001, description: 'Revenue', amount: 10000, type: 'credit' }],
    })
    const result = transformTransaction(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].accountId).toBe('4001')
    expect(result.lineItems![0].totalAmount).toBe(10000)
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
