import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import {
  transformBill,
  type PandleBill,
  type PandleBillLine,
} from '../../../../../../../src/verticals/accounting/adapters/pandle/transform/bill'

function makeBillLine(overrides: Partial<PandleBillLine> = {}): PandleBillLine {
  return {
    id: 201,
    account_id: 500,
    description: 'Office supplies',
    quantity: 10,
    unit_price: 25,
    net_amount: 250,
    tax_rate_id: 1,
    tax_amount: 50,
    total_amount: 300,
    ...overrides,
  }
}

function makeBill(overrides: Partial<PandleBill> = {}): PandleBill {
  return {
    id: 2001,
    invoice_number: 'BILL-001',
    supplier_id: 30,
    currency: 'GBP',
    issue_date: '2024-02-01',
    due_date: '2024-03-01',
    status: 'sent',
    net_amount: 250,
    tax_amount: 50,
    total_amount: 300,
    paid_amount: 0,
    balance: 300,
    reference: 'SUP-REF',
    invoice_lines: [],
    ...overrides,
  }
}

describe('transformBill', () => {
  it('maps id from raw id as string', () => {
    expect(transformBill(makeBill()).id).toBe('2001')
  })

  it('maps invoice_number to billNumber', () => {
    expect(transformBill(makeBill()).billNumber).toBe('BILL-001')
  })

  it('maps supplier_id to contactId as string', () => {
    expect(transformBill(makeBill()).contactId).toBe('30')
  })

  it('maps currency', () => {
    expect(transformBill(makeBill()).currency).toBe('GBP')
  })

  it('maps amounts correctly', () => {
    const b = transformBill(makeBill())
    expect(b.totalAmount).toBe(300)
    expect(b.taxAmount).toBe(50)
    expect(b.balanceAmount).toBe(300)
  })

  it('maps issue_date to postedAt as Date', () => {
    expect(transformBill(makeBill()).postedAt).toEqual(new Date('2024-02-01'))
  })

  it('maps due_date to dueAt as Date', () => {
    expect(transformBill(makeBill()).dueAt).toEqual(new Date('2024-03-01'))
  })

  it('returns undefined postedAt when issue_date is empty', () => {
    expect(transformBill(makeBill({ issue_date: '' })).postedAt).toBeUndefined()
  })

  it('maps status draft to DRAFT', () => {
    expect(transformBill(makeBill({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps status sent to AUTHORIZED', () => {
    expect(transformBill(makeBill({ status: 'sent' })).status).toBe('AUTHORIZED')
  })

  it('maps status paid to PAID', () => {
    expect(transformBill(makeBill({ status: 'paid' })).status).toBe('PAID')
  })

  it('maps status part_paid to PARTIALLY_PAID', () => {
    expect(transformBill(makeBill({ status: 'part_paid' })).status).toBe('PARTIALLY_PAID')
  })

  it('maps status void to VOIDED', () => {
    expect(transformBill(makeBill({ status: 'void' })).status).toBe('VOIDED')
  })

  it('maps invoice_lines to lineItems', () => {
    const raw = makeBill({ invoice_lines: [makeBillLine()] })
    const result = transformBill(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].id).toBe('201')
    expect(result.lineItems![0].accountId).toBe('500')
    expect(result.lineItems![0].itemDescription).toBe('Office supplies')
    expect(result.lineItems![0].unitAmount).toBe(25)
    expect(result.lineItems![0].unitQuantity).toBe(10)
    expect(result.lineItems![0].totalAmount).toBe(300)
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
