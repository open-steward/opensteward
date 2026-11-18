import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import { transformTransaction, type SmaccTransaction } from '../../../../../../../src/verticals/accounting/adapters/smacc/transform/transaction'

function makeRaw(overrides: Partial<SmaccTransaction> = {}): SmaccTransaction {
  return {
    id: 'txn-1',
    memo: 'Invoice payment',
    description: 'Desc',
    amount: 500,
    currency: 'EUR',
    type: 'payment',
    account_id: 'acc-3',
    contact_id: 'c-8',
    reference: 'REF-TX3',
    ...overrides,
  }
}

describe('smacc transformTransaction', () => {
  it('maps id to id', () => {
    expect(transformTransaction(makeRaw()).id).toBe('txn-1')
  })

  it('maps memo to memo', () => {
    expect(transformTransaction(makeRaw()).memo).toBe('Invoice payment')
  })

  it('falls back to description when memo absent', () => {
    expect(transformTransaction(makeRaw({ memo: undefined })).memo).toBe('Desc')
  })

  it('maps type to type', () => {
    expect(transformTransaction(makeRaw()).type).toBe('payment')
  })

  it('maps amount to totalAmount', () => {
    expect(transformTransaction(makeRaw()).totalAmount).toBe(500)
  })

  it('maps account_id to accountId', () => {
    expect(transformTransaction(makeRaw()).accountId).toBe('acc-3')
  })

  it('maps contact_id to contacts', () => {
    const result = transformTransaction(makeRaw())
    expect(result.contacts).toHaveLength(1)
    expect(result.contacts![0].id).toBe('c-8')
  })

  it('maps reference to reference', () => {
    expect(transformTransaction(makeRaw()).reference).toBe('REF-TX3')
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
