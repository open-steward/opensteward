import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  type CraterPayment,
} from '../../../../../../../src/verticals/accounting/adapters/crater/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'

function makePayment(overrides: Partial<CraterPayment> = {}): CraterPayment {
  return {
    id: 'pay-10',
    payment_number: 'PAY-0010',
    payment_date: '2026-03-20',
    amount: 12000,
    notes: 'Invoice payment',
    payment_type: 'incoming',
    invoice_id: 'inv-1',
    customer: { id: 'cus-1', name: 'Acme Corp' },
    invoice: { id: 'inv-1', invoice_number: 'INV-0001' },
    updated_at: '2026-03-20T12:00:00.000Z',
    ...overrides,
  }
}

describe('transformTransaction (crater)', () => {
  it('maps id and type from payment_type', () => {
    const result = transformTransaction(makePayment())
    expect(result.id).toBe('pay-10')
    expect(result.type).toBe('incoming')
  })

  it('maps reference from invoice.invoice_number', () => {
    expect(transformTransaction(makePayment()).reference).toBe('INV-0001')
  })

  it('falls back to invoice_id when invoice object has no invoice_number', () => {
    const result = transformTransaction(
      makePayment({ invoice: { id: 'inv-2' }, invoice_id: 'inv-2' }),
    )
    expect(result.reference).toBe('inv-2')
  })

  it('maps memo from notes', () => {
    expect(transformTransaction(makePayment()).memo).toBe('Invoice payment')
  })

  it('maps totalAmount', () => {
    expect(transformTransaction(makePayment({ amount: 12000 })).totalAmount).toBe(12000)
  })

  it('maps customer contact from raw.customer object', () => {
    const result = transformTransaction(makePayment())
    expect(result.contacts).toHaveLength(1)
    expect(result.contacts![0].id).toBe('cus-1')
    expect(result.contacts![0].name).toBe('Acme Corp')
  })

  it('falls back to customer_business_id when no customer object', () => {
    const result = transformTransaction(
      makePayment({ customer: undefined, customer_business_id: 'biz-99' }),
    )
    expect(result.contacts).toHaveLength(1)
    expect(result.contacts![0].id).toBe('biz-99')
  })

  it('parses payment_date as createdAt', () => {
    const result = transformTransaction(makePayment())
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.createdAt!.toISOString().startsWith('2026-03-20')).toBe(true)
  })

  it('parses updated_at as updatedAt (not payment_date)', () => {
    const result = transformTransaction(makePayment())
    expect(result.updatedAt).toBeInstanceOf(Date)
    expect(result.updatedAt!.toISOString().startsWith('2026-03-20')).toBe(true)
  })

  it('attaches raw as metadata', () => {
    const raw = makePayment()
    expect(transformTransaction(raw).metadata).toBe(raw)
  })

  it('passes TransactionSchema.parse without throwing', () => {
    const result = transformTransaction(makePayment())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
