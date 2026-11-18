import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import {
  transformTransaction,
  type LexofficeTransaction,
} from '../../../../../../../src/verticals/accounting/adapters/lexoffice/transform/transaction'

function makeTransaction(overrides: Partial<LexofficeTransaction> = {}): LexofficeTransaction {
  return {
    id: 'txn-uuid-001',
    createdDate: '2024-03-01T09:00:00Z',
    bookingDate: '2024-03-01',
    amount: 595,
    currency: 'EUR',
    purpose: 'Invoice payment March',
    creditorId: 'creditor-uuid-001',
    debtorId: 'debtor-uuid-001',
    ...overrides,
  }
}

describe('transformTransaction', () => {
  it('maps id correctly', () => {
    expect(transformTransaction(makeTransaction()).id).toBe('txn-uuid-001')
  })

  it('maps purpose to memo', () => {
    expect(transformTransaction(makeTransaction()).memo).toBe('Invoice payment March')
  })

  it('maps currency correctly', () => {
    expect(transformTransaction(makeTransaction()).currency).toBe('EUR')
  })

  it('maps amount to totalAmount', () => {
    expect(transformTransaction(makeTransaction()).totalAmount).toBe(595)
  })

  it('parses createdDate as Date object for createdAt', () => {
    expect(transformTransaction(makeTransaction()).createdAt).toEqual(new Date('2024-03-01T09:00:00Z'))
  })

  it('parses bookingDate as Date object for updatedAt', () => {
    expect(transformTransaction(makeTransaction()).updatedAt).toEqual(new Date('2024-03-01'))
  })

  it('maps creditorId and debtorId to contacts array', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.contacts).toHaveLength(2)
    expect(result.contacts![0].id).toBe('creditor-uuid-001')
    expect(result.contacts![1].id).toBe('debtor-uuid-001')
  })

  it('includes only creditorId in contacts when debtorId is absent', () => {
    const result = transformTransaction(makeTransaction({ debtorId: '' }))
    expect(result.contacts).toHaveLength(1)
    expect(result.contacts![0].id).toBe('creditor-uuid-001')
  })

  it('includes only debtorId in contacts when creditorId is absent', () => {
    const result = transformTransaction(makeTransaction({ creditorId: '' }))
    expect(result.contacts).toHaveLength(1)
    expect(result.contacts![0].id).toBe('debtor-uuid-001')
  })

  it('returns undefined contacts when both creditorId and debtorId are absent', () => {
    const result = transformTransaction(makeTransaction({ creditorId: '', debtorId: '' }))
    expect(result.contacts).toBeUndefined()
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeTransaction()
    expect(transformTransaction(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTransaction(makeTransaction())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
