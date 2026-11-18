import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import { transformTransaction, type CmicTransaction } from '../../../../../../../src/verticals/accounting/adapters/cmic/transform/transaction'

function makeTransaction(overrides: Partial<CmicTransaction> = {}): CmicTransaction {
  return {
    TransactionId: 'TXN-001',
    Description: 'Material payment',
    Amount: 12500,
    Currency: 'USD',
    TransactionDate: '2024-03-20',
    AccountCode: '2000',
    ProjectCode: 'PRJ-001',
    CostCode: 'CC-MATERIALS',
    ...overrides,
  }
}

describe('transformTransaction (CMiC)', () => {
  it('maps id from TransactionId', () => {
    expect(transformTransaction(makeTransaction()).id).toBe('TXN-001')
  })

  it('maps amount and currency', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.totalAmount).toBe(12500)
    expect(result.currency).toBe('USD')
  })

  it('maps description as memo', () => {
    expect(transformTransaction(makeTransaction()).memo).toBe('Material payment')
  })

  it('maps AccountCode as accountId', () => {
    expect(transformTransaction(makeTransaction()).accountId).toBe('2000')
  })

  it('parses TransactionDate as Date object', () => {
    expect(transformTransaction(makeTransaction()).createdAt).toEqual(new Date('2024-03-20'))
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
