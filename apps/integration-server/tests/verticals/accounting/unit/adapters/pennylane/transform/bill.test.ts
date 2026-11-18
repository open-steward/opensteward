import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import {
  transformBill,
  type PennylaneBill,
} from '../../../../../../../src/verticals/accounting/adapters/pennylane/transform/bill'

function makeBill(overrides: Partial<PennylaneBill> = {}): PennylaneBill {
  return {
    id: 'bill-1',
    invoice_number: 'BILL-2024-001',
    supplier: { source_id: 'sup-1', name: 'Supplier Co' },
    date: '2024-03-01',
    deadline: '2024-03-31',
    currency: 'EUR',
    amount: 600,
    remaining_amount: 600,
    status: 'received',
    ...overrides,
  }
}

describe('transformBill', () => {
  it('maps id correctly', () => {
    expect(transformBill(makeBill()).id).toBe('bill-1')
  })

  it('maps invoice_number to billNumber', () => {
    expect(transformBill(makeBill()).billNumber).toBe('BILL-2024-001')
  })

  it('maps supplier source_id to contactId', () => {
    expect(transformBill(makeBill()).contactId).toBe('sup-1')
  })

  it('returns undefined contactId when supplier is null', () => {
    expect(transformBill(makeBill({ supplier: null })).contactId).toBeUndefined()
  })

  it('maps currency correctly', () => {
    expect(transformBill(makeBill()).currency).toBe('EUR')
  })

  it('maps amount to totalAmount', () => {
    expect(transformBill(makeBill()).totalAmount).toBe(600)
  })

  it('maps remaining_amount to balanceAmount', () => {
    expect(transformBill(makeBill()).balanceAmount).toBe(600)
  })

  it('parses date as Date object', () => {
    expect(transformBill(makeBill()).postedAt).toEqual(new Date('2024-03-01'))
  })

  it('parses deadline as Date object', () => {
    expect(transformBill(makeBill()).dueAt).toEqual(new Date('2024-03-31'))
  })

  it('maps status draft to DRAFT', () => {
    expect(transformBill(makeBill({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps status not_sent to AUTHORIZED', () => {
    expect(transformBill(makeBill({ status: 'not_sent' })).status).toBe('AUTHORIZED')
  })

  it('maps status sent to AUTHORIZED', () => {
    expect(transformBill(makeBill({ status: 'sent' })).status).toBe('AUTHORIZED')
  })

  it('maps status received to AUTHORIZED', () => {
    expect(transformBill(makeBill({ status: 'received' })).status).toBe('AUTHORIZED')
  })

  it('maps status partially_paid to PARTIALLY_PAID', () => {
    expect(transformBill(makeBill({ status: 'partially_paid' })).status).toBe('PARTIALLY_PAID')
  })

  it('maps status paid to PAID', () => {
    expect(transformBill(makeBill({ status: 'paid' })).status).toBe('PAID')
  })

  it('maps status cancelled to VOIDED', () => {
    expect(transformBill(makeBill({ status: 'cancelled' })).status).toBe('VOIDED')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeBill()
    expect(transformBill(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformBill(makeBill())
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})
