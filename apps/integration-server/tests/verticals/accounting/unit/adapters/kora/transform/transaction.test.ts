import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import { transformTransaction, type KoraTransaction } from '../../../../../../../src/verticals/accounting/adapters/kora/transform/transaction'

function makeRaw(overrides: Partial<KoraTransaction> = {}): KoraTransaction {
  return { reference: 'ref-001', ...overrides }
}

describe('kora transformTransaction', () => {
  it('maps reference to id', () => {
    expect(transformTransaction(makeRaw()).id).toBe('ref-001')
  })
  it('handles missing optional fields gracefully', () => {
    expect(() => transformTransaction(makeRaw())).not.toThrow()
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformTransaction(raw).metadata).toBe(raw)
  })
  it('maps created_at to createdAt as Date', () => {
    const result = transformTransaction(makeRaw({ created_at: '2024-08-01T00:00:00Z' }))
    expect(result.createdAt).toEqual(new Date('2024-08-01T00:00:00Z'))
  })
  it('maps customer.id to contacts', () => {
    const result = transformTransaction(makeRaw({ customer: { id: 'cust-1', name: 'Test' } }))
    expect(result.contacts).toHaveLength(1)
    expect(result.contacts![0].id).toBe('cust-1')
  })
  it('maps currency', () => {
    expect(transformTransaction(makeRaw({ currency: 'NGN' })).currency).toBe('NGN')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTransaction(makeRaw())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
