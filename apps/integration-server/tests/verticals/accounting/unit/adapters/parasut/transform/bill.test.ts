import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import { transformBill, type ParasutBill } from '../../../../../../../src/verticals/accounting/adapters/parasut/transform/bill'

function makeBill(overrides: Partial<ParasutBill> = {}): ParasutBill {
  return {
    id: 'bill_1',
    type: 'e_invoices',
    attributes: {
      item_type: 'purchase_bill',
      status: 'draft',
      invoice_no: 'BILL-001',
      net_total: 800,
      gross_total: 944,
      vat_total: 144,
      due_date: '2024-02-20',
      issue_date: '2024-01-20',
      currency: 'TRY',
      contact_id: 'supplier_42',
    },
    ...overrides,
  }
}

describe('transformBill (parasut)', () => {
  it('maps id correctly', () => {
    expect(transformBill(makeBill()).id).toBe('bill_1')
  })

  it('maps billNumber', () => {
    expect(transformBill(makeBill()).billNumber).toBe('BILL-001')
  })

  it('maps totalAmount and taxAmount', () => {
    const b = transformBill(makeBill())
    expect(b.totalAmount).toBe(944)
    expect(b.taxAmount).toBe(144)
  })

  it('maps contactId', () => {
    expect(transformBill(makeBill()).contactId).toBe('supplier_42')
  })

  it('parses dates as Date objects', () => {
    const b = transformBill(makeBill())
    expect(b.postedAt).toEqual(new Date('2024-01-20'))
    expect(b.dueAt).toEqual(new Date('2024-02-20'))
  })

  it('maps draft status to DRAFT', () => {
    expect(transformBill(makeBill()).status).toBe('DRAFT')
  })

  it('maps sent status to AUTHORIZED', () => {
    const raw = makeBill({ attributes: { ...makeBill().attributes, status: 'sent' } })
    expect(transformBill(raw).status).toBe('AUTHORIZED')
  })

  it('maps paid status to PAID', () => {
    const raw = makeBill({ attributes: { ...makeBill().attributes, status: 'paid' } })
    expect(transformBill(raw).status).toBe('PAID')
  })

  it('maps cancelled status to VOIDED', () => {
    const raw = makeBill({ attributes: { ...makeBill().attributes, status: 'cancelled' } })
    expect(transformBill(raw).status).toBe('VOIDED')
  })

  it('passes raw object as metadata', () => {
    const raw = makeBill()
    expect(transformBill(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformBill(makeBill())
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})
