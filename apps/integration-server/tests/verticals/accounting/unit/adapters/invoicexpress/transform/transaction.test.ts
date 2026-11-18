import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import { transformTransaction, type InvoiceXpressTransaction } from '../../../../../../../src/verticals/accounting/adapters/invoicexpress/transform/transaction'

function makeTransaction(overrides: Partial<InvoiceXpressTransaction> = {}): InvoiceXpressTransaction {
  return {
    id: 20,
    date: '2024-02-10',
    description: 'Wire transfer payment',
    value: 500,
    currency: 'EUR',
    ...overrides,
  }
}

describe('transformTransaction', () => {
  it('maps core fields correctly', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.id).toBe('20')
    expect(result.memo).toBe('Wire transfer payment')
    expect(result.totalAmount).toBe(500)
    expect(result.currency).toBe('EUR')
  })

  it('parses date as Date object', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.createdAt).toEqual(new Date('2024-02-10'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeTransaction({ description: 'Cash payment' })
    const result = transformTransaction(raw)
    expect(result.metadata).toBe(raw)
  })

  it('returns undefined memo when description is empty', () => {
    const result = transformTransaction(makeTransaction({ description: '' }))
    expect(result.memo).toBeUndefined()
  })

  it('returns undefined currency when empty', () => {
    const result = transformTransaction(makeTransaction({ currency: '' }))
    expect(result.currency).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTransaction(makeTransaction())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
