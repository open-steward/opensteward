import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import {
  transformTransaction,
  type BillomatTransaction,
} from '../../../../../../../src/verticals/accounting/adapters/billomat/transform/transaction'

function makeTransaction(overrides: Partial<BillomatTransaction> = {}): BillomatTransaction {
  return {
    id: 'pay-001',
    invoice_id: 'inv-001',
    date: '2024-03-15',
    amount: 11900,
    currency_code: 'EUR',
    type: 'CREDIT_NOTE',
    comment: 'Zahlung per Überweisung',
    ...overrides,
  }
}

describe('transformTransaction', () => {
  it('maps id from raw id', () => {
    expect(transformTransaction(makeTransaction()).id).toBe('pay-001')
  })

  it('maps invoice_id to accountId', () => {
    expect(transformTransaction(makeTransaction()).accountId).toBe('inv-001')
  })

  it('maps type', () => {
    expect(transformTransaction(makeTransaction()).type).toBe('CREDIT_NOTE')
  })

  it('maps comment to reference', () => {
    expect(transformTransaction(makeTransaction()).reference).toBe('Zahlung per Überweisung')
  })

  it('maps currency_code to currency', () => {
    expect(transformTransaction(makeTransaction()).currency).toBe('EUR')
  })

  it('maps amount to totalAmount', () => {
    expect(transformTransaction(makeTransaction()).totalAmount).toBe(11900)
  })

  it('maps date to createdAt as Date', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.createdAt?.toISOString().startsWith('2024-03-15')).toBe(true)
  })

  it('returns undefined createdAt when date is empty', () => {
    expect(transformTransaction(makeTransaction({ date: '' })).createdAt).toBeUndefined()
  })

  it('returns undefined reference when comment is empty', () => {
    expect(transformTransaction(makeTransaction({ comment: '' })).reference).toBeUndefined()
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
