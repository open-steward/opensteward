import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import { transformTransaction, type FinancioPayment } from '../../../../../../../src/verticals/accounting/adapters/financio/transform/transaction'

function makeRaw(overrides: Partial<FinancioPayment> = {}): FinancioPayment {
  return {
    id: '900',
    payment_date: '2024-09-15',
    amount: 1060,
    reference: 'PMT-001',
    type: 'receipt',
    account_code: '1-001',
    contact_id: '10',
    contact_name: 'Acme Pte Ltd',
    ...overrides,
  }
}

describe('transformTransaction (financio)', () => {
  it('maps core fields correctly', () => {
    const result = transformTransaction(makeRaw())
    expect(result.id).toBe('900')
    expect(result.totalAmount).toBe(1060)
    expect(result.reference).toBe('PMT-001')
    expect(result.type).toBe('receipt')
  })

  it('parses date as Date object', () => {
    const result = transformTransaction(makeRaw())
    expect(result.createdAt).toEqual(new Date('2024-09-15'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw({ reference: 'PMT-SPECIAL' })
    const result = transformTransaction(raw)
    expect(result.metadata).toBe(raw)
    expect((result.metadata as Record<string, unknown>)['reference']).toBe('PMT-SPECIAL')
  })

  it('maps contact to contacts array', () => {
    const result = transformTransaction(makeRaw())
    expect(result.contacts).toHaveLength(1)
    expect(result.contacts![0].id).toBe('10')
    expect(result.contacts![0].name).toBe('Acme Pte Ltd')
  })

  it('maps payment type', () => {
    const result = transformTransaction(makeRaw({ type: 'payment' }))
    expect(result.type).toBe('payment')
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
