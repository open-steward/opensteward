import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import { transformTransaction, type BukkuPayment } from '../../../../../../../src/verticals/accounting/adapters/bukku/transform/transaction'

function makeRaw(overrides: Partial<BukkuPayment> = {}): BukkuPayment {
  return {
    id: '88',
    date: '2024-09-15',
    amount: 1150,
    reference: 'REF-001',
    description: 'Payment received',
    type: 'receipt',
    account_id: '100',
    contact_id: '42',
    contact_name: 'Acme Sdn Bhd',
    ...overrides,
  }
}

describe('transformTransaction (bukku)', () => {
  it('maps core fields correctly', () => {
    const result = transformTransaction(makeRaw())
    expect(result.id).toBe('88')
    expect(result.totalAmount).toBe(1150)
    expect(result.reference).toBe('REF-001')
    expect(result.type).toBe('receipt')
    expect(result.accountId).toBe('100')
  })

  it('parses date as Date object', () => {
    const result = transformTransaction(makeRaw())
    expect(result.createdAt).toEqual(new Date('2024-09-15'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw({ reference: 'REF-999' })
    const result = transformTransaction(raw)
    expect(result.metadata).toBe(raw)
    expect((result.metadata as Record<string, unknown>)['reference']).toBe('REF-999')
  })

  it('maps contact to contacts array', () => {
    const result = transformTransaction(makeRaw())
    expect(result.contacts).toHaveLength(1)
    expect(result.contacts![0].id).toBe('42')
    expect(result.contacts![0].name).toBe('Acme Sdn Bhd')
  })

  it('maps payment type', () => {
    const result = transformTransaction(makeRaw({ type: 'payment' }))
    expect(result.type).toBe('payment')
  })

  it('maps description to memo', () => {
    const result = transformTransaction(makeRaw())
    expect(result.memo).toBe('Payment received')
  })

  it('returns no contacts when contact_id is absent', () => {
    const result = transformTransaction(makeRaw({ contact_id: '' }))
    expect(result.contacts).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTransaction(makeRaw())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
