import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import { transformTransaction, type ReckonTransaction } from '../../../../../../../src/verticals/accounting/adapters/reckon/transform/transaction'

function makeRaw(overrides: Partial<ReckonTransaction> = {}): ReckonTransaction {
  return {
    id: 'txn-001',
    date: '2024-03-15',
    amount: 1100,
    type: 'PAYMENT',
    description: 'Invoice payment',
    reference: 'INV-001',
    contactId: 'contact-001',
    accountId: 'acc-101',
    ...overrides,
  }
}

describe('transformTransaction (reckon)', () => {
  it('maps core fields correctly', () => {
    const result = transformTransaction(makeRaw())
    expect(result.id).toBe('txn-001')
    expect(result.type).toBe('PAYMENT')
    expect(result.totalAmount).toBe(1100)
    expect(result.accountId).toBe('acc-101')
    expect(result.reference).toBe('INV-001')
    expect(result.memo).toBe('Invoice payment')
  })

  it('maps contact from contactId', () => {
    const result = transformTransaction(makeRaw())
    expect(result.contacts).toHaveLength(1)
    expect(result.contacts![0].id).toBe('contact-001')
  })

  it('omits contacts when contactId is empty', () => {
    const result = transformTransaction(makeRaw({ contactId: '' }))
    expect(result.contacts).toBeUndefined()
  })

  it('parses date as Date object', () => {
    const result = transformTransaction(makeRaw())
    expect(result.createdAt).toEqual(new Date('2024-03-15'))
  })

  it('passes raw as metadata identity', () => {
    const raw = makeRaw()
    const result = transformTransaction(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTransaction(makeRaw())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
