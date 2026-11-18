import { describe, it, expect } from 'vitest'
import { transformBill } from '../../../../../../../src/verticals/accounting/adapters/ledgers-cloud/transform/bill'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'

const base = {
  id: 'bill-10',
  bill_number: 'BILL-001',
  invoice_date: '2024-04-01T00:00:00.000Z',
  due_date: '2030-05-01T00:00:00.000Z',
  contact: { id: 'cont-5' },
  currency: 'USD',
  payment_status: 'Not Paid',
  total_amount: 20000,
  paid_amount: 0,
  balance_amount: 20000,
  tax_amount: 2000,
  discount_amount: 500,
  notes: 'Office equipment',
  created_at: '2024-04-01T00:00:00.000Z',
  updated_at: '2024-04-02T00:00:00.000Z',
  items: [
    {
      id: 'item-1',
      description: 'Laptop',
      unit_price: 20000,
      quantity: 1,
      amount: 20000,
      tax_amount: 2000,
    },
  ],
}

describe('transformBill', () => {
  it('maps core fields', () => {
    const result = transformBill(base)
    expect(result.id).toBe('bill-10')
    expect(result.billNumber).toBe('BILL-001')
    expect(result.contactId).toBe('cont-5')
    expect(result.currency).toBe('USD')
    expect(result.totalAmount).toBe(20000)
    expect(result.taxAmount).toBe(2000)
    expect(result.discountAmount).toBe(500)
    expect(result.notes).toBe('Office equipment')
  })

  it('maps payment_status Paid to PAID', () => {
    expect(transformBill({ ...base, payment_status: 'Paid' }).status).toBe('PAID')
  })

  it('maps payment_status Part Paid to PARTIALLY_PAID', () => {
    expect(transformBill({ ...base, payment_status: 'Part Paid' }).status).toBe('PARTIALLY_PAID')
  })

  it('maps payment_status Not Paid to AUTHORIZED', () => {
    expect(transformBill({ ...base, payment_status: 'Not Paid' }).status).toBe('AUTHORIZED')
  })

  it('maps contact from nested contact.id', () => {
    expect(transformBill(base).contactId).toBe('cont-5')
  })

  it('maps contact from flat contact_id when nested absent', () => {
    const result = transformBill({ ...base, contact: undefined, contact_id: 'flat-cont' })
    expect(result.contactId).toBe('flat-cont')
  })

  it('parses invoice_date as postedAt', () => {
    expect(transformBill(base).postedAt).toEqual(new Date('2024-04-01T00:00:00.000Z'))
  })

  it('parses due_date as dueAt', () => {
    expect(transformBill(base).dueAt).toEqual(new Date('2030-05-01T00:00:00.000Z'))
  })

  it('maps items to lineItems', () => {
    const result = transformBill(base)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].itemDescription).toBe('Laptop')
    expect(result.lineItems![0].unitAmount).toBe(20000)
    expect(result.lineItems![0].unitQuantity).toBe(1)
    expect(result.lineItems![0].totalAmount).toBe(20000)
  })

  it('passes schema validation', () => {
    expect(() => BillSchema.parse(transformBill(base))).not.toThrow()
  })
})
