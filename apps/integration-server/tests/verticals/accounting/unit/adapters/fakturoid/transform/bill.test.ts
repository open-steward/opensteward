import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import {
  transformBill,
  type FakturoidBill,
  type FakturoidBillLine,
} from '../../../../../../../src/verticals/accounting/adapters/fakturoid/transform/bill'

function makeBillLine(overrides: Partial<FakturoidBillLine> = {}): FakturoidBillLine {
  return {
    id: 201,
    name: 'Office Supplies',
    quantity: 5,
    unit_price: 200,
    vat_rate: 21,
    unit_price_without_vat: 200,
    unit_price_with_vat: 242,
    ...overrides,
  }
}

function makeBill(overrides: Partial<FakturoidBill> = {}): FakturoidBill {
  return {
    id: 2001,
    number: 'EXP-2024-001',
    subject_id: 55,
    status: 'open',
    due_on: '2024-03-01',
    issued_on: '2024-02-01',
    total: 1210,
    remaining_amount: 1210,
    paid_amount: 0,
    currency: 'CZK',
    vat_price: 210,
    lines: [],
    ...overrides,
  }
}

describe('transformBill', () => {
  it('maps id from raw id as string', () => {
    expect(transformBill(makeBill()).id).toBe('2001')
  })

  it('maps number to billNumber', () => {
    expect(transformBill(makeBill()).billNumber).toBe('EXP-2024-001')
  })

  it('maps subject_id to contactId as string', () => {
    expect(transformBill(makeBill()).contactId).toBe('55')
  })

  it('maps currency', () => {
    expect(transformBill(makeBill()).currency).toBe('CZK')
  })

  it('maps amounts correctly', () => {
    const b = transformBill(makeBill())
    expect(b.totalAmount).toBe(1210)
    expect(b.taxAmount).toBe(210)
    expect(b.balanceAmount).toBe(1210)
  })

  it('maps issued_on to postedAt as Date', () => {
    expect(transformBill(makeBill()).postedAt).toEqual(new Date('2024-02-01'))
  })

  it('maps due_on to dueAt as Date', () => {
    expect(transformBill(makeBill()).dueAt).toEqual(new Date('2024-03-01'))
  })

  it('returns undefined postedAt when issued_on is empty', () => {
    expect(transformBill(makeBill({ issued_on: '' })).postedAt).toBeUndefined()
  })

  it('maps status open to SUBMITTED', () => {
    expect(transformBill(makeBill({ status: 'open' })).status).toBe('SUBMITTED')
  })

  it('maps status paid to PAID', () => {
    expect(transformBill(makeBill({ status: 'paid' })).status).toBe('PAID')
  })

  it('maps status overdue to OVERDUE', () => {
    expect(transformBill(makeBill({ status: 'overdue' })).status).toBe('OVERDUE')
  })

  it('maps status cancelled to VOIDED', () => {
    expect(transformBill(makeBill({ status: 'cancelled' })).status).toBe('VOIDED')
  })

  it('maps status partial to PARTIALLY_PAID', () => {
    expect(transformBill(makeBill({ status: 'partial' })).status).toBe('PARTIALLY_PAID')
  })

  it('maps unknown status to DRAFT', () => {
    expect(transformBill(makeBill({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps lines to lineItems', () => {
    const raw = makeBill({ lines: [makeBillLine()] })
    const result = transformBill(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('201')
    expect(li.itemDescription).toBe('Office Supplies')
    expect(li.unitAmount).toBe(200)
    expect(li.unitQuantity).toBe(5)
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
