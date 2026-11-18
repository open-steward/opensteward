import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import {
  transformTransaction,
  type FreshBooksPayment,
} from '../../../../../../../src/verticals/accounting/adapters/freshbooks/transform/transaction'

function makePayment(overrides: Partial<FreshBooksPayment> = {}): FreshBooksPayment {
  return {
    id: 800,
    client_id: 55,
    invoice_id: 200,
    amount: { amount: '1000.00', code: 'USD' },
    currency_code: 'USD',
    date: '2024-03-15',
    note: 'Payment for services',
    type: 'Check',
    ...overrides,
  }
}

describe('transformTransaction', () => {
  it('maps id correctly (number to string)', () => {
    expect(transformTransaction(makePayment()).id).toBe('800')
  })

  it('maps invoice_id to reference', () => {
    expect(transformTransaction(makePayment()).reference).toBe('200')
  })

  it('maps type correctly', () => {
    expect(transformTransaction(makePayment()).type).toBe('Check')
  })

  it('maps note to memo', () => {
    expect(transformTransaction(makePayment()).memo).toBe('Payment for services')
  })

  it('maps currency_code to currency', () => {
    expect(transformTransaction(makePayment()).currency).toBe('USD')
  })

  it('parses amount to totalAmount', () => {
    expect(transformTransaction(makePayment()).totalAmount).toBe(1000)
  })

  it('parses date as Date object for createdAt', () => {
    expect(transformTransaction(makePayment()).createdAt).toEqual(new Date('2024-03-15'))
  })

  it('maps client_id to contacts array', () => {
    const result = transformTransaction(makePayment())
    expect(result.contacts).toHaveLength(1)
    expect(result.contacts![0].id).toBe('55')
  })

  it('returns undefined contacts when no client_id', () => {
    const result = transformTransaction(makePayment({ client_id: 0 }))
    expect(result.contacts).toBeUndefined()
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makePayment()
    expect(transformTransaction(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTransaction(makePayment())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
