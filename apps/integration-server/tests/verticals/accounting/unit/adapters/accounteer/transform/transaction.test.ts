import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import { transformTransaction, type AccounteerTransaction } from '../../../../../../../src/verticals/accounting/adapters/accounteer/transform/transaction'

function makeRaw(overrides: Partial<AccounteerTransaction> = {}): AccounteerTransaction {
  return { id: '1', ...overrides }
}

describe('accounteer transformTransaction', () => {
  it('maps id', () => {
    expect(transformTransaction(makeRaw()).id).toBe('1')
  })
  it('handles missing optional fields gracefully', () => {
    expect(() => transformTransaction(makeRaw())).not.toThrow()
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformTransaction(raw).metadata).toBe(raw)
  })
  it('maps description to memo', () => {
    expect(transformTransaction(makeRaw({ description: 'Payment' })).memo).toBe('Payment')
  })
  it('maps contact_id to contacts array', () => {
    const result = transformTransaction(makeRaw({ contact_id: '55' }))
    expect(result.contacts).toHaveLength(1)
    expect(result.contacts![0].id).toBe('55')
  })
  it('maps type', () => {
    expect(transformTransaction(makeRaw({ type: 'CREDIT' })).type).toBe('CREDIT')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTransaction(makeRaw())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
