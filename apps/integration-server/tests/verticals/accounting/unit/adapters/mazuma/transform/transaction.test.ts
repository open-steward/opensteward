import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import { transformTransaction, type MazumaTransaction } from '../../../../../../../src/verticals/accounting/adapters/mazuma/transform/transaction'

function makeRaw(overrides: Partial<MazumaTransaction> = {}): MazumaTransaction {
  return { id: '1', ...overrides }
}

describe('mazuma transformTransaction', () => {
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
  it('defaults currency to GBP', () => {
    expect(transformTransaction(makeRaw()).currency).toBe('GBP')
  })
  it('maps description to memo', () => {
    expect(transformTransaction(makeRaw({ description: 'Payment' })).memo).toBe('Payment')
  })
  it('maps date to createdAt as Date', () => {
    expect(transformTransaction(makeRaw({ date: '2024-08-01' })).createdAt).toEqual(new Date('2024-08-01'))
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTransaction(makeRaw())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
