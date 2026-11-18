import { describe, it, expect } from 'vitest'
import {
  transformBill,
  type APBill,
  type APBillLine,
} from '../../../../../../../src/verticals/accounting/adapters/accountsportal/transform/bill'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'

function makeAPBillLine(overrides: Partial<APBillLine> = {}): APBillLine {
  return {
    id: 1,
    account_id: 5000,
    description: 'Server hosting',
    quantity: 1,
    unit_price: 200.0,
    net_amount: 200.0,
    tax_rate_id: 5,
    tax_amount: 40.0,
    total_amount: 240.0,
    ...overrides,
  }
}

function makeAPBill(overrides: Partial<APBill> = {}): APBill {
  return {
    id: 300,
    bill_number: 'BILL-300',
    contact_id: 75,
    currency: 'GBP',
    issue_date: '2024-02-01',
    due_date: '2024-03-01',
    status: 'paid',
    net_amount: 200.0,
    tax_amount: 40.0,
    total_amount: 240.0,
    paid_amount: 240.0,
    balance: 0,
    notes: 'Hosting bill',
    bill_lines: [makeAPBillLine()],
    created_at: '2024-02-01T00:00:00.000Z',
    updated_at: '2024-02-15T00:00:00.000Z',
    ...overrides,
  }
}

describe('transformBill (accountsportal)', () => {
  it('maps id as string', () => {
    expect(transformBill(makeAPBill({ id: 300 })).id).toBe('300')
  })

  it('maps bill_number to billNumber', () => {
    expect(transformBill(makeAPBill()).billNumber).toBe('BILL-300')
  })

  it('prefixes contactId with s_', () => {
    // Bills are against suppliers; prefix is 's_'
    expect(transformBill(makeAPBill({ contact_id: 75 })).contactId).toBe('s_75')
  })

  it('converts total_amount to minor units', () => {
    expect(transformBill(makeAPBill({ total_amount: 240.0 })).totalAmount).toBe(24000)
  })

  it('converts tax_amount to minor units', () => {
    expect(transformBill(makeAPBill({ tax_amount: 40.0 })).taxAmount).toBe(4000)
  })

  it('converts paid_amount to minor units', () => {
    expect(transformBill(makeAPBill({ paid_amount: 240.0 })).paidAmount).toBe(24000)
  })

  it('converts balance to minor units as balanceAmount', () => {
    expect(transformBill(makeAPBill({ balance: 0 })).balanceAmount).toBe(0)
  })

  it('maps "paid" status to PAID', () => {
    expect(transformBill(makeAPBill({ status: 'paid' })).status).toBe('PAID')
  })

  it('maps "draft" to DRAFT', () => {
    expect(transformBill(makeAPBill({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps "void" to VOIDED', () => {
    expect(transformBill(makeAPBill({ status: 'void' })).status).toBe('VOIDED')
  })

  it('maps "part_paid" to PARTIALLY_PAID', () => {
    expect(transformBill(makeAPBill({ status: 'part_paid' })).status).toBe('PARTIALLY_PAID')
  })

  it('maps "approved" to AUTHORIZED', () => {
    expect(transformBill(makeAPBill({ status: 'approved' })).status).toBe('AUTHORIZED')
  })

  it('maps notes', () => {
    expect(transformBill(makeAPBill()).notes).toBe('Hosting bill')
  })

  it('maps bill_lines with minor-unit conversion', () => {
    const result = transformBill(makeAPBill())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('1')
    expect(li.accountId).toBe('5000')
    expect(li.itemDescription).toBe('Server hosting')
    expect(li.unitAmount).toBe(20000) // 200.0 * 100
    expect(li.taxAmount).toBe(4000) // 40.0 * 100
    expect(li.totalAmount).toBe(24000) // 240.0 * 100
    expect(li.taxrateId).toBe('5')
  })

  it('maps issue_date to postedAt and due_date to dueAt', () => {
    const result = transformBill(makeAPBill())
    expect(result.postedAt).toBeInstanceOf(Date)
    expect(result.dueAt).toBeInstanceOf(Date)
  })

  it('maps createdAt and updatedAt as Date', () => {
    const result = transformBill(makeAPBill())
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('passes BillSchema.parse without throwing', () => {
    const result = transformBill(makeAPBill())
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})
