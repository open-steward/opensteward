import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import {
  transformTransaction,
  type DeskeraTransaction,
} from '../../../../../../../src/verticals/accounting/adapters/deskera/transform/transaction'

function makeRaw(overrides: Partial<DeskeraTransaction> = {}): DeskeraTransaction {
  return {
    id: 'TXN-001',
    date: '2024-01-15',
    amount: 5000,
    type: 'CREDIT',
    description: 'Payment received',
    reference: 'REF-123',
    contactCode: 'CUST-001',
    bankAccountCode: 'BANK-001',
    ...overrides,
  }
}

describe('transformTransaction (Deskera)', () => {
  it('maps core fields correctly', () => {
    const result = transformTransaction(makeRaw())
    expect(result.id).toBe('TXN-001')
    expect(result.accountId).toBe('BANK-001')
    expect(result.type).toBe('CREDIT')
    expect(result.reference).toBe('REF-123')
    expect(result.totalAmount).toBe(5000)
  })

  it('parses date as Date object', () => {
    const result = transformTransaction(makeRaw())
    expect(result.createdAt).toEqual(new Date('2024-01-15'))
  })

  it('maps contactCode to contacts array', () => {
    const result = transformTransaction(makeRaw())
    expect(result.contacts).toHaveLength(1)
    expect(result.contacts![0].id).toBe('CUST-001')
  })

  it('returns no contacts when contactCode is absent', () => {
    const result = transformTransaction(makeRaw({ contactCode: undefined }))
    expect(result.contacts).toBeUndefined()
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformTransaction(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTransaction(makeRaw())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
