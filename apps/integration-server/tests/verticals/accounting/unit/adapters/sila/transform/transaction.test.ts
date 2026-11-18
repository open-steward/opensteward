import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import { transformTransaction, type SilaTransaction } from '../../../../../../../src/verticals/accounting/adapters/sila/transform/transaction'

function makeRaw(overrides: Partial<SilaTransaction> = {}): SilaTransaction {
  return {
    transaction_id: 'TX-SILA-001',
    reference_id: 'REF-001',
    description: 'Wire transfer',
    sila_amount: 10000,
    usd_amount: 100,
    status: 'SUCCESS',
    transaction_type: 'issue',
    user_handle: 'alice.eth',
    created: '2024-11-15T10:00:00Z',
    ...overrides,
  }
}

describe('sila transformTransaction', () => {
  it('maps transaction_id to id', () => {
    expect(transformTransaction(makeRaw()).id).toBe('TX-SILA-001')
  })

  it('maps reference_id to reference', () => {
    expect(transformTransaction(makeRaw()).reference).toBe('REF-001')
  })

  it('maps transaction_type to type', () => {
    expect(transformTransaction(makeRaw()).type).toBe('issue')
  })

  it('sets currency to USD', () => {
    expect(transformTransaction(makeRaw()).currency).toBe('USD')
  })

  it('prefers usd_amount over sila_amount/100', () => {
    expect(transformTransaction(makeRaw()).totalAmount).toBe(100)
  })

  it('converts sila_amount/100 when usd_amount absent', () => {
    expect(transformTransaction(makeRaw({ usd_amount: undefined })).totalAmount).toBe(100)
  })

  it('maps user_handle to contacts', () => {
    const result = transformTransaction(makeRaw())
    expect(result.contacts).toHaveLength(1)
    expect(result.contacts![0].id).toBe('alice.eth')
  })

  it('maps created to createdAt as Date', () => {
    expect(transformTransaction(makeRaw()).createdAt).toEqual(new Date('2024-11-15T10:00:00Z'))
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
