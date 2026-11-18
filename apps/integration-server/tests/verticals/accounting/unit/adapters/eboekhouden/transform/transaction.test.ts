import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import { transformTransaction, type EBoekhoudenTransaction } from '../../../../../../../src/verticals/accounting/adapters/eboekhouden/transform/transaction'

function makeTransaction(overrides: Partial<EBoekhoudenTransaction> = {}): EBoekhoudenTransaction {
  return {
    id: 200,
    date: '2024-04-10',
    amount: 500,
    description: 'Betaling ontvangen',
    ledgerId: 1000,
    currency: 'EUR',
    ...overrides,
  }
}

describe('transformTransaction (eboekhouden)', () => {
  it('maps id to string', () => {
    expect(transformTransaction(makeTransaction()).id).toBe('200')
  })

  it('maps accountId from ledgerId', () => {
    expect(transformTransaction(makeTransaction()).accountId).toBe('1000')
  })

  it('maps totalAmount', () => {
    expect(transformTransaction(makeTransaction()).totalAmount).toBe(500)
  })

  it('maps memo from description', () => {
    expect(transformTransaction(makeTransaction()).memo).toBe('Betaling ontvangen')
  })

  it('maps createdAt from date', () => {
    expect(transformTransaction(makeTransaction()).createdAt).toEqual(new Date('2024-04-10'))
  })

  it('passes raw object as metadata', () => {
    const raw = makeTransaction()
    expect(transformTransaction(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTransaction(makeTransaction())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
