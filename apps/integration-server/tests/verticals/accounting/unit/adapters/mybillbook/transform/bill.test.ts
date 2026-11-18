import { describe, it, expect } from 'vitest'
import {
  transformBill,
  type MybillbookBill,
  type MybillbookBillItem,
} from '../../../../../../../src/verticals/accounting/adapters/mybillbook/transform/bill'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'

const sampleItem: MybillbookBillItem = {
  id: 'item-001',
  item_name: 'Office Chair',
  description: 'Ergonomic chair',
  unit_price: 5000.0,
  quantity: 2,
  tax_amount: 1800.0,
  total_amount: 11800.0,
}

function makeRaw(overrides: Partial<MybillbookBill> = {}): MybillbookBill {
  return {
    id: 'bill-001',
    bill_number: 'BILL-001',
    party_id: 'party-001',
    bill_date: '2024-03-01',
    due_date: '2024-03-31',
    status: 'paid',
    currency: 'INR',
    total_amount: 11800.0,
    tax_amount: 1800.0,
    discount_amount: 0,
    paid_amount: 11800.0,
    balance_amount: 0,
    notes: 'Purchase of office supplies',
    items: [sampleItem],
    created_at: '2024-03-01T10:00:00.000Z',
    updated_at: '2024-03-01T11:00:00.000Z',
    ...overrides,
  }
}

describe('transformBill (mybillbook)', () => {
  it('maps id', () => {
    expect(transformBill(makeRaw()).id).toBe('bill-001')
  })

  it('maps bill_number to billNumber', () => {
    expect(transformBill(makeRaw()).billNumber).toBe('BILL-001')
  })

  it('maps party_id to contactId', () => {
    expect(transformBill(makeRaw()).contactId).toBe('party-001')
  })

  it('maps currency', () => {
    expect(transformBill(makeRaw()).currency).toBe('INR')
  })

  it('maps paid status to PAID', () => {
    expect(transformBill(makeRaw({ status: 'paid' })).status).toBe('PAID')
  })

  it('maps partially_paid status', () => {
    expect(transformBill(makeRaw({ status: 'partially_paid' })).status).toBe('PARTIALLY_PAID')
  })

  it('maps draft status', () => {
    expect(transformBill(makeRaw({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps cancelled status to VOIDED', () => {
    expect(transformBill(makeRaw({ status: 'cancelled' })).status).toBe('VOIDED')
  })

  it('converts total_amount to minor units (11800.00 → 1180000)', () => {
    expect(transformBill(makeRaw()).totalAmount).toBe(1180000)
  })

  it('converts tax_amount to minor units (1800.00 → 180000)', () => {
    expect(transformBill(makeRaw()).taxAmount).toBe(180000)
  })

  it('converts paid_amount to minor units', () => {
    expect(transformBill(makeRaw()).paidAmount).toBe(1180000)
  })

  it('maps bill_date to postedAt via toIsoDatetime', () => {
    const b = transformBill(makeRaw())
    expect(b.postedAt).toBeInstanceOf(Date)
  })

  it('maps lineitem item_name to itemName', () => {
    expect(transformBill(makeRaw()).lineItems![0].itemName).toBe('Office Chair')
  })

  it('converts lineitem unit_price to minor units (5000.00 → 500000)', () => {
    expect(transformBill(makeRaw()).lineItems![0].unitAmount).toBe(500000)
  })

  it('passes BillSchema.parse without throwing', () => {
    expect(() => BillSchema.parse(transformBill(makeRaw()))).not.toThrow()
  })
})
