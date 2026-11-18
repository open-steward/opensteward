import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import { transformTransaction, type SageTransaction } from '../../../../../../../src/verticals/accounting/adapters/sagebusinesscloud/transform/transaction'

function makeRaw(overrides: Partial<SageTransaction> = {}): SageTransaction {
  return {
    id: 'txn-001',
    date: '2024-01-15',
    type: 'PAYMENT',
    total_amount: 1200,
    contact: { id: 'contact-001' },
    reference: 'REF-001',
    description: 'Invoice payment',
    ...overrides,
  }
}

describe('transformTransaction (SageBusinessCloud)', () => {
  it('maps core fields correctly', () => {
    const result = transformTransaction(makeRaw())
    expect(result.id).toBe('txn-001')
    expect(result.totalAmount).toBe(1200)
    expect(result.reference).toBe('REF-001')
    expect(result.memo).toBe('Invoice payment')
    expect(result.type).toBe('CREDIT')
  })

  it('maps RECEIPT to DEBIT', () => {
    expect(transformTransaction(makeRaw({ type: 'RECEIPT' })).type).toBe('DEBIT')
  })

  it('maps contact', () => {
    const result = transformTransaction(makeRaw())
    expect(result.contacts).toHaveLength(1)
    expect(result.contacts![0].id).toBe('contact-001')
  })

  it('parses date as Date object', () => {
    const result = transformTransaction(makeRaw())
    expect(result.createdAt).toEqual(new Date('2024-01-15'))
  })

  it('sets metadata to raw object', () => {
    const raw = makeRaw()
    expect(transformTransaction(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTransaction(makeRaw())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
