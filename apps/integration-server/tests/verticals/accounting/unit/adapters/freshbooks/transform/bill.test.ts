import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import {
  transformBill,
  type FreshBooksBill,
  type FreshBooksBillLine,
} from '../../../../../../../src/verticals/accounting/adapters/freshbooks/transform/bill'

function makeLine(overrides: Partial<FreshBooksBillLine> = {}): FreshBooksBillLine {
  return {
    lineid: 1,
    description: 'Line item',
    unit_cost: { amount: '100.00' },
    quantity: '2',
    amount: { amount: '200.00' },
    ...overrides,
  }
}

function makeBill(overrides: Partial<FreshBooksBill> = {}): FreshBooksBill {
  return {
    id: 42,
    vendor_id: 7,
    bill_number: 'BILL-001',
    due_date: '2024-04-01',
    issue_date: '2024-03-01',
    currency_code: 'USD',
    amount: { amount: '500.00', code: 'USD' },
    outstanding: { amount: '500.00', code: 'USD' },
    paid: { amount: '0.00', code: 'USD' },
    status: 4,
    lines: [makeLine()],
    ...overrides,
  }
}

describe('transformBill', () => {
  it('maps id correctly (number to string)', () => {
    expect(transformBill(makeBill()).id).toBe('42')
  })

  it('maps bill_number to billNumber', () => {
    expect(transformBill(makeBill()).billNumber).toBe('BILL-001')
  })

  it('maps vendor_id to contactId', () => {
    expect(transformBill(makeBill()).contactId).toBe('7')
  })

  it('maps currency_code to currency', () => {
    expect(transformBill(makeBill()).currency).toBe('USD')
  })

  it('parses amount to totalAmount', () => {
    expect(transformBill(makeBill()).totalAmount).toBe(500)
  })

  it('parses outstanding to balanceAmount', () => {
    expect(transformBill(makeBill()).balanceAmount).toBe(500)
  })

  it('parses paid to paidAmount', () => {
    expect(transformBill(makeBill()).paidAmount).toBe(0)
  })

  it('parses issue_date as Date object for postedAt', () => {
    expect(transformBill(makeBill()).postedAt).toEqual(new Date('2024-03-01'))
  })

  it('parses due_date as Date object for dueAt', () => {
    expect(transformBill(makeBill()).dueAt).toEqual(new Date('2024-04-01'))
  })

  it('maps status 1 to DRAFT', () => {
    expect(transformBill(makeBill({ status: 1 })).status).toBe('DRAFT')
  })

  it('maps status 4 to AUTHORIZED', () => {
    expect(transformBill(makeBill({ status: 4 })).status).toBe('AUTHORIZED')
  })

  it('maps status 5 to OVERDUE', () => {
    expect(transformBill(makeBill({ status: 5 })).status).toBe('OVERDUE')
  })

  it('maps status 9 to PARTIALLY_PAID', () => {
    expect(transformBill(makeBill({ status: 9 })).status).toBe('PARTIALLY_PAID')
  })

  it('maps status 12 to PAID', () => {
    expect(transformBill(makeBill({ status: 12 })).status).toBe('PAID')
  })

  it('maps unknown status to DRAFT', () => {
    expect(transformBill(makeBill({ status: 99 })).status).toBe('DRAFT')
  })

  it('maps line items correctly', () => {
    const result = transformBill(makeBill())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].id).toBe('1')
    expect(result.lineItems![0].totalAmount).toBe(200)
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
