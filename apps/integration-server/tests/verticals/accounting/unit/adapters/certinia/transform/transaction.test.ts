import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import { transformTransaction, type CertiniaTransaction } from '../../../../../../../src/verticals/accounting/adapters/certinia/transform/transaction'

function makeTransaction(overrides: Partial<CertiniaTransaction> = {}): CertiniaTransaction {
  return {
    Id: 'TXN000000001',
    Name: 'TXN-2024-001',
    Transaction_Date__c: '2024-03-10',
    Description__c: 'Wire transfer',
    Amount__c: 12000,
    Currency__c: 'USD',
    ...overrides,
  }
}

describe('transformTransaction (Certinia)', () => {
  it('maps core fields correctly', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.id).toBe('TXN000000001')
    expect(result.memo).toBe('Wire transfer')
    expect(result.totalAmount).toBe(12000)
    expect(result.currency).toBe('USD')
  })

  it('parses date as Date object', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.createdAt).toEqual(new Date('2024-03-10'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeTransaction()
    expect(transformTransaction(raw).metadata).toBe(raw)
  })

  it('handles missing description gracefully', () => {
    const result = transformTransaction(makeTransaction({ Description__c: '' }))
    expect(result.memo).toBeUndefined()
  })

  it('handles missing currency gracefully', () => {
    const result = transformTransaction(makeTransaction({ Currency__c: '' }))
    expect(result.currency).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTransaction(makeTransaction())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
