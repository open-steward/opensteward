import { describe, it, expect } from 'vitest'
import {
  transformPayment,
  type WfirmaPayment,
} from '../../../../../../../src/verticals/accounting/adapters/wfirma/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'

function makePayment(overrides: Partial<WfirmaPayment> = {}): WfirmaPayment {
  return {
    id: 700,
    object_name: 'invoice',
    date: '2024-07-10',
    value: '1230.00',
    payment_method: 'transfer',
    currency_label: 'PLN',
    notes: 'Payment for FV 1/2024',
    invoice: { id: 500 },
    contractor: { id: 99 },
    created: '2024-07-10T00:00:00.000Z',
    modified: '2024-07-10T00:00:00.000Z',
    ...overrides,
  }
}

describe('transformPayment', () => {
  it('maps core fields correctly', () => {
    const result = transformPayment(makePayment())
    expect(result.id).toBe('700')
    expect(result.type).toBe('PAYMENT')
    expect(result.currency).toBe('PLN')
    expect(result.paymentMethod).toBe('transfer')
    expect(result.memo).toBe('Payment for FV 1/2024')
  })

  it('converts value to totalAmount in minor units', () => {
    const result = transformPayment(makePayment({ value: '1230.00' }))
    expect(result.totalAmount).toBe(123000)
  })

  it('maps object_name=invoice to type PAYMENT', () => {
    const result = transformPayment(makePayment({ object_name: 'invoice' }))
    expect(result.type).toBe('PAYMENT')
  })

  it('maps object_name=expense to type BILL_PAYMENT', () => {
    const result = transformPayment(
      makePayment({ object_name: 'expense', invoice: undefined, expense: { id: 200 } }),
    )
    expect(result.type).toBe('BILL_PAYMENT')
  })

  it('extracts invoice reference', () => {
    const result = transformPayment(makePayment({ invoice: { id: 500 } }))
    expect(result.reference).toBe('invoice:500')
  })

  it('extracts expense reference when no invoice', () => {
    const result = transformPayment(
      makePayment({ object_name: 'expense', invoice: undefined, expense: { id: 300 } }),
    )
    expect(result.reference).toBe('expense:300')
  })

  it('maps contractor to contacts', () => {
    const result = transformPayment(makePayment({ contractor: { id: 99 } }))
    expect(result.contacts).toHaveLength(1)
    expect(result.contacts![0].id).toBe('99')
  })

  it('omits memo when notes is 0 (falsy-but-number)', () => {
    const result = transformPayment(makePayment({ notes: 0 }))
    expect(result.memo).toBeUndefined()
  })

  it('maps currency_label to currency', () => {
    const result = transformPayment(makePayment({ currency_label: 'EUR' }))
    expect(result.currency).toBe('EUR')
  })

  it('parses dates as Date objects', () => {
    const result = transformPayment(makePayment())
    expect(result.createdAt).toEqual(new Date('2024-07-10T00:00:00.000Z'))
  })

  it('passes raw as metadata', () => {
    const raw = makePayment()
    const result = transformPayment(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a schema-valid result', () => {
    const result = transformPayment(makePayment())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
