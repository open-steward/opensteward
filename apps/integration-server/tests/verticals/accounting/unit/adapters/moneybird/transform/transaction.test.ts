import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import { transformTransaction, type MoneybirdTransaction } from '../../../../../../../src/verticals/accounting/adapters/moneybird/transform/transaction'

function makeTxn(overrides: Partial<MoneybirdTransaction> = {}): MoneybirdTransaction {
  return { id: 600, date: '2024-05-01', amount: '500', message: 'Betaling', financial_account_id: 10, ...overrides }
}

describe('transformTransaction (moneybird)', () => {
  it('maps id and accountId', () => {
    expect(transformTransaction(makeTxn()).id).toBe('600')
    expect(transformTransaction(makeTxn()).accountId).toBe('10')
  })
  it('maps totalAmount from string', () => { expect(transformTransaction(makeTxn()).totalAmount).toBe(500) })
  it('maps memo', () => { expect(transformTransaction(makeTxn()).memo).toBe('Betaling') })
  it('maps createdAt', () => { expect(transformTransaction(makeTxn()).createdAt).toEqual(new Date('2024-05-01')) })
  it('passes raw as metadata', () => {
    const raw = makeTxn()
    expect(transformTransaction(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTransaction(makeTxn())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
