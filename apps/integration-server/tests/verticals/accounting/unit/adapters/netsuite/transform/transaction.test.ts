import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import { transformTransaction, type NetSuiteTransaction } from '../../../../../../../src/verticals/accounting/adapters/netsuite/transform/transaction'

function makeTxn(overrides: Partial<NetSuiteTransaction> = {}): NetSuiteTransaction {
  return { id: 500, tranId: 'PMT-001', total: 2000, currency: 'USD', tranDate: '2024-05-01', ...overrides }
}

describe('transformTransaction (netsuite)', () => {
  it('maps id and reference', () => {
    expect(transformTransaction(makeTxn()).id).toBe('500')
    expect(transformTransaction(makeTxn()).reference).toBe('PMT-001')
  })
  it('maps totalAmount', () => { expect(transformTransaction(makeTxn()).totalAmount).toBe(2000) })
  it('maps createdAt', () => { expect(transformTransaction(makeTxn()).createdAt).toEqual(new Date('2024-05-01')) })
  it('passes raw as metadata', () => {
    const raw = makeTxn()
    expect(transformTransaction(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTransaction(makeTxn())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
