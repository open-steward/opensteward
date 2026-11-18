import { describe, it, expect } from 'vitest'
import {
  transformBill,
  type BuiltAfricaBill,
  type BuiltAfricaBillItem,
} from '../../../../../../../src/verticals/accounting/adapters/built-africa/transform/bill'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'

function makeBillItem(overrides: Partial<BuiltAfricaBillItem> = {}): BuiltAfricaBillItem {
  return {
    id: 1,
    bill_id: 10,
    description: 'Office supplies',
    quantity: 3,
    unit_price: 10.0,
    amount: 30.0,
    tax_amount: 3.0,
    ...overrides,
  }
}

function makeBill(overrides: Partial<BuiltAfricaBill> = {}): BuiltAfricaBill {
  return {
    id: 200,
    bill_id: 'BILL-200',
    supplier_id: 7,
    purchase_date: '2024-02-01',
    due_date: '2024-03-01',
    gross_amount: 100.0,
    amount_due: 100.0,
    amount_paid: 0,
    balance: 100.0,
    paid_status: 'unpaid',
    base_currency: 'USD',
    note: 'Net 30',
    items: [],
    total_taxAmount: 10.0,
    created_at: '2024-01-15T09:30:00Z',
    updated_at: '2024-02-01T14:20:00Z',
    deleted_at: null,
    ...overrides,
  }
}

describe('transformBill', () => {
  it('maps id to string', () => {
    expect(transformBill(makeBill()).id).toBe('200')
  })

  it('maps bill_id to billNumber', () => {
    expect(transformBill(makeBill()).billNumber).toBe('BILL-200')
  })

  it('maps supplier_id to contactId with supp_ prefix', () => {
    expect(transformBill(makeBill()).contactId).toBe('supp_7')
  })

  it('maps base_currency to currency', () => {
    expect(transformBill(makeBill()).currency).toBe('USD')
  })

  it('falls back to fx_currency when base_currency is absent', () => {
    expect(transformBill(makeBill({ base_currency: undefined, fx_currency: 'GHS' })).currency).toBe(
      'GHS',
    )
  })

  it('maps gross_amount to totalAmount in minor units', () => {
    expect(transformBill(makeBill({ gross_amount: 100.0 })).totalAmount).toBe(10000)
  })

  it('maps total_taxAmount to taxAmount in minor units', () => {
    expect(transformBill(makeBill({ total_taxAmount: 10.0 })).taxAmount).toBe(1000)
  })

  it('maps amount_paid to paidAmount in minor units', () => {
    expect(transformBill(makeBill({ amount_paid: 50.5 })).paidAmount).toBe(5050)
  })

  it('maps balance to balanceAmount in minor units', () => {
    expect(transformBill(makeBill({ balance: 49.5 })).balanceAmount).toBe(4950)
  })

  it('maps note to notes', () => {
    expect(transformBill(makeBill()).notes).toBe('Net 30')
  })

  it('maps paid_status paid to PAID', () => {
    expect(transformBill(makeBill({ paid_status: 'paid' })).status).toBe('PAID')
  })

  it('maps paid_status partial to PARTIALLY_PAID', () => {
    expect(transformBill(makeBill({ paid_status: 'partial' })).status).toBe('PARTIALLY_PAID')
  })

  it('maps paid_status overdue to OVERDUE', () => {
    expect(transformBill(makeBill({ paid_status: 'overdue' })).status).toBe('OVERDUE')
  })

  it('maps unpaid paid_status to AUTHORIZED', () => {
    expect(transformBill(makeBill({ paid_status: 'unpaid' })).status).toBe('AUTHORIZED')
  })

  it('maps deleted_at to VOIDED status', () => {
    expect(transformBill(makeBill({ deleted_at: '2024-03-01T00:00:00Z' })).status).toBe('VOIDED')
  })

  it('maps purchase_date to postedAt as Date', () => {
    expect(transformBill(makeBill()).postedAt).toEqual(new Date('2024-02-01'))
  })

  it('maps due_date to dueAt as Date', () => {
    expect(transformBill(makeBill()).dueAt).toEqual(new Date('2024-03-01'))
  })

  it('maps created_at to createdAt as Date', () => {
    expect(transformBill(makeBill()).createdAt).toEqual(new Date('2024-01-15T09:30:00Z'))
  })

  it('maps updated_at to updatedAt as Date', () => {
    expect(transformBill(makeBill()).updatedAt).toEqual(new Date('2024-02-01T14:20:00Z'))
  })

  it('maps items to lineItems', () => {
    const raw = makeBill({ items: [makeBillItem()] })
    const result = transformBill(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('1')
    expect(li.itemDescription).toBe('Office supplies')
    expect(li.unitAmount).toBe(1000)
    expect(li.unitQuantity).toBe(3)
    expect(li.totalAmount).toBe(3000)
    expect(li.taxAmount).toBe(300)
  })

  it('handles empty items array', () => {
    expect(transformBill(makeBill({ items: [] })).lineItems).toEqual([])
  })

  it('returns undefined contactId when supplier_id is absent', () => {
    expect(transformBill(makeBill({ supplier_id: undefined })).contactId).toBeUndefined()
  })

  it('passes raw object as metadata', () => {
    const raw = makeBill()
    expect(transformBill(raw).metadata).toBe(raw)
  })

  it('output passes schema validation', () => {
    expect(() => BillSchema.parse(transformBill(makeBill()))).not.toThrow()
  })
})
