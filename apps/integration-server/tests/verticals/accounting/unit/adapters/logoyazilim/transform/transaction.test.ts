import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import { transformTransaction, type LogoTransaction } from '../../../../../../../src/verticals/accounting/adapters/logoyazilim/transform/transaction'

function makeTransaction(overrides: Partial<LogoTransaction> = {}): LogoTransaction {
  return {
    id: '500',
    Date: '2024-03-15',
    Description: 'Payment received',
    Amount: 25000,
    CurrencyCode: 'TRY',
    AccountId: '1100',
    ...overrides,
  }
}

describe('transformTransaction (logoyazilim)', () => {
  it('maps id correctly', () => {
    expect(transformTransaction(makeTransaction()).id).toBe('500')
  })

  it('maps memo from Description', () => {
    expect(transformTransaction(makeTransaction()).memo).toBe('Payment received')
  })

  it('maps totalAmount', () => {
    expect(transformTransaction(makeTransaction()).totalAmount).toBe(25000)
  })

  it('maps currency from CurrencyCode', () => {
    expect(transformTransaction(makeTransaction()).currency).toBe('TRY')
  })

  it('maps accountId from AccountId', () => {
    expect(transformTransaction(makeTransaction()).accountId).toBe('1100')
  })

  it('parses date as Date object', () => {
    expect(transformTransaction(makeTransaction()).createdAt).toEqual(new Date('2024-03-15'))
  })

  it('passes raw object as metadata', () => {
    const raw = makeTransaction()
    expect(transformTransaction(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const raw: LogoTransaction = { id: '999' }
    const t = transformTransaction(raw)
    expect(t.id).toBe('999')
    expect(t.memo).toBeUndefined()
    expect(t.totalAmount).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTransaction(makeTransaction())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
