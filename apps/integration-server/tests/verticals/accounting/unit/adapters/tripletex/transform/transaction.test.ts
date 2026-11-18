import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import {
  transformTransaction,
  type TripletexPayment,
} from '../../../../../../../src/verticals/accounting/adapters/tripletex/transform/transaction'

function makePayment(overrides: Partial<TripletexPayment> = {}): TripletexPayment {
  return {
    id: 808,
    amount: 4500,
    amountCurrency: 4500,
    currency: { id: '1', code: 'NOK' },
    paymentDate: '2024-10-15',
    description: 'Invoice payment',
    employee: { id: 6, displayName: 'Ola Nordmann' },
    ...overrides,
  }
}

describe('transformTransaction', () => {
  it('maps id correctly', () => {
    expect(transformTransaction(makePayment()).id).toBe('808')
  })

  it('maps description to memo', () => {
    expect(transformTransaction(makePayment()).memo).toBe('Invoice payment')
  })

  it('maps currency code correctly', () => {
    expect(transformTransaction(makePayment()).currency).toBe('NOK')
  })

  it('maps amountCurrency to totalAmount', () => {
    expect(transformTransaction(makePayment()).totalAmount).toBe(4500)
  })

  it('parses paymentDate as createdAt Date object', () => {
    expect(transformTransaction(makePayment()).createdAt).toEqual(new Date('2024-10-15'))
  })

  it('creates a single lineitem with totalAmount', () => {
    const result = transformTransaction(makePayment())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].totalAmount).toBe(4500)
  })

  it('includes description in lineitem', () => {
    const result = transformTransaction(makePayment())
    expect(result.lineItems![0].description).toBe('Invoice payment')
  })

  it('sets currency to undefined when currency is absent', () => {
    expect(transformTransaction(makePayment({ currency: undefined })).currency).toBeUndefined()
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
