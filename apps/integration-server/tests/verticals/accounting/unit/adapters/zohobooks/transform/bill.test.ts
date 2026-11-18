import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import {
  transformBill,
  type ZohoBooksBill,
  type ZohoBooksBillLineItem,
} from '../../../../../../../src/verticals/accounting/adapters/zohobooks/transform/bill'

function makeBillLineItem(overrides: Partial<ZohoBooksBillLineItem> = {}): ZohoBooksBillLineItem {
  return {
    line_item_id: 'li-1',
    item_id: 'item-1',
    description: 'Office Chair',
    rate: 250,
    quantity: 2,
    item_total: 500,
    tax_amount: 50,
    account_id: 'acct-99',
    ...overrides,
  }
}

function makeBill(overrides: Partial<ZohoBooksBill> = {}): ZohoBooksBill {
  return {
    bill_id: 'bill-001',
    bill_number: 'BILL-2024-001',
    vendor_id: 'vendor-42',
    date: '2024-03-01',
    due_date: '2024-03-31',
    currency_code: 'USD',
    total: 1100,
    balance: 1100,
    tax_total: 100,
    status: 'open',
    line_items: [makeBillLineItem()],
    ...overrides,
  }
}

describe('transformBill', () => {
  it('maps bill_id to id', () => {
    expect(transformBill(makeBill()).id).toBe('bill-001')
  })

  it('maps bill_number to billNumber', () => {
    expect(transformBill(makeBill()).billNumber).toBe('BILL-2024-001')
  })

  it('maps vendor_id to contactId', () => {
    expect(transformBill(makeBill()).contactId).toBe('vendor-42')
  })

  it('maps currency_code to currency', () => {
    expect(transformBill(makeBill()).currency).toBe('USD')
  })

  it('maps total to totalAmount', () => {
    expect(transformBill(makeBill()).totalAmount).toBe(1100)
  })

  it('maps tax_total to taxAmount', () => {
    expect(transformBill(makeBill()).taxAmount).toBe(100)
  })

  it('maps balance to balanceAmount', () => {
    expect(transformBill(makeBill()).balanceAmount).toBe(1100)
  })

  it('parses date as postedAt Date object', () => {
    expect(transformBill(makeBill()).postedAt).toEqual(new Date('2024-03-01'))
  })

  it('parses due_date as dueAt Date object', () => {
    expect(transformBill(makeBill()).dueAt).toEqual(new Date('2024-03-31'))
  })

  it('maps status draft to DRAFT', () => {
    expect(transformBill(makeBill({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps status open to AUTHORIZED', () => {
    expect(transformBill(makeBill({ status: 'open' })).status).toBe('AUTHORIZED')
  })

  it('maps status overdue to OVERDUE', () => {
    expect(transformBill(makeBill({ status: 'overdue' })).status).toBe('OVERDUE')
  })

  it('maps status paid to PAID', () => {
    expect(transformBill(makeBill({ status: 'paid' })).status).toBe('PAID')
  })

  it('maps status void to VOIDED', () => {
    expect(transformBill(makeBill({ status: 'void' })).status).toBe('VOIDED')
  })

  it('maps status partially_paid to PARTIALLY_PAID', () => {
    expect(transformBill(makeBill({ status: 'partially_paid' })).status).toBe('PARTIALLY_PAID')
  })

  it('maps line_items to lineItems', () => {
    const result = transformBill(makeBill())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].itemDescription).toBe('Office Chair')
    expect(result.lineItems![0].unitQuantity).toBe(2)
    expect(result.lineItems![0].totalAmount).toBe(500)
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
