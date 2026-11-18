import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import { transformTransaction, type UhasibuTransaction } from '../../../../../../../src/verticals/accounting/adapters/uhasibu/transform/transaction'

function makeRaw(overrides: Partial<UhasibuTransaction> = {}): UhasibuTransaction {
  return {
    id: 'utx-1',
    memo: 'Rent payment',
    description: 'Monthly rent',
    amount: 1200,
    currency: 'KES',
    type: 'expense',
    account_id: 'acc-2',
    contact_id: 'c-6',
    reference: 'REF-U01',
    ...overrides,
  }
}

describe('uhasibu transformTransaction', () => {
  it('maps id to id', () => {
    expect(transformTransaction(makeRaw()).id).toBe('utx-1')
  })

  it('maps memo to memo', () => {
    expect(transformTransaction(makeRaw()).memo).toBe('Rent payment')
  })

  it('falls back to description when memo absent', () => {
    expect(transformTransaction(makeRaw({ memo: undefined })).memo).toBe('Monthly rent')
  })

  it('maps type to type', () => {
    expect(transformTransaction(makeRaw()).type).toBe('expense')
  })

  it('maps amount to totalAmount', () => {
    expect(transformTransaction(makeRaw()).totalAmount).toBe(1200)
  })

  it('maps account_id to accountId', () => {
    expect(transformTransaction(makeRaw()).accountId).toBe('acc-2')
  })

  it('maps contact_id to contacts', () => {
    const result = transformTransaction(makeRaw())
    expect(result.contacts).toHaveLength(1)
    expect(result.contacts![0].id).toBe('c-6')
  })

  it('maps reference to reference', () => {
    expect(transformTransaction(makeRaw()).reference).toBe('REF-U01')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformTransaction(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformTransaction(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTransaction(makeRaw())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
