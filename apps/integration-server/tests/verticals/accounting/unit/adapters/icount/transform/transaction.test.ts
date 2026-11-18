import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import { transformTransaction, type ICountPayment } from '../../../../../../../src/verticals/accounting/adapters/icount/transform/transaction'

function makePayment(overrides: Partial<ICountPayment> = {}): ICountPayment {
  return {
    payment_id: 'pay_99',
    date: '2024-03-15',
    sum: 2500,
    currency_code: 'ILS',
    description: 'Invoice payment',
    client_id: 'clt_3',
    ...overrides,
  }
}

describe('transformTransaction (icount)', () => {
  it('maps core fields correctly', () => {
    const result = transformTransaction(makePayment())
    expect(result.id).toBe('pay_99')
    expect(result.totalAmount).toBe(2500)
    expect(result.currency).toBe('ILS')
    expect(result.memo).toBe('Invoice payment')
  })

  it('maps client_id to contacts', () => {
    const result = transformTransaction(makePayment())
    expect(result.contacts).toHaveLength(1)
    expect(result.contacts![0].id).toBe('clt_3')
  })

  it('parses date as Date object', () => {
    const result = transformTransaction(makePayment())
    expect(result.createdAt).toEqual(new Date('2024-03-15'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makePayment()
    const result = transformTransaction(raw)
    expect(result.metadata).toBe(raw)
  })

  it('handles missing client_id', () => {
    const result = transformTransaction(makePayment({ client_id: undefined }))
    expect(result.contacts).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTransaction(makePayment())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
