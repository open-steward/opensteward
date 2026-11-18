import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import { transformTransaction, type KwaraTransaction } from '../../../../../../../src/verticals/accounting/adapters/kwara/transform/transaction'

function makeRaw(overrides: Partial<KwaraTransaction> = {}): KwaraTransaction {
  return {
    id: 'txn-001',
    created_at: '2024-01-15T10:00:00Z',
    type: 'credit',
    amount: 5000,
    currency: 'KES',
    member_id: 'mem-001',
    description: 'Loan disbursement',
    ...overrides,
  }
}

describe('transformTransaction (Kwara)', () => {
  it('maps core fields correctly', () => {
    const r = transformTransaction(makeRaw())
    expect(r.id).toBe('txn-001')
    expect(r.totalAmount).toBe(5000)
    expect(r.currency).toBe('KES')
    expect(r.memo).toBe('Loan disbursement')
  })

  it('maps credit type to CREDIT', () => {
    expect(transformTransaction(makeRaw({ type: 'credit' })).type).toBe('CREDIT')
  })

  it('maps debit type to DEBIT', () => {
    expect(transformTransaction(makeRaw({ type: 'debit' })).type).toBe('DEBIT')
  })

  it('maps member_id as contact', () => {
    const r = transformTransaction(makeRaw())
    expect(r.contacts![0].id).toBe('mem-001')
  })

  it('parses created_at as Date', () => {
    const r = transformTransaction(makeRaw())
    expect(r.createdAt).toEqual(new Date('2024-01-15T10:00:00Z'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    expect(transformTransaction(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTransaction(makeRaw())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
