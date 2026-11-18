import { describe, it, expect } from 'vitest'
import {
  transformBill,
  type QoyodBill,
} from '../../../../../../../src/verticals/accounting/adapters/qoyod/transform/bill'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'

function makeRaw(overrides: Partial<QoyodBill> = {}): QoyodBill {
  return {
    id: 200,
    reference: 'BILL-2025-001',
    vendor_id: 55,
    date: '2025-04-01',
    due_date: '2025-05-01',
    status: 'approved',
    notes: 'Payment for supplies',
    currency: 'SAR',
    subtotal: 1000,
    tax_total: 150,
    total: 1150,
    paid_amount: 0,
    balance: 1150,
    line_items: [
      {
        id: 1,
        product_id: 10,
        description: 'Paper',
        quantity: 5,
        unit_price: 200,
        tax_amount: 30,
        total: 1030,
        account_id: 20,
      },
    ],
    ...overrides,
  }
}

describe('qoyod transformBill', () => {
  it('maps numeric id to string', () => {
    expect(transformBill(makeRaw()).id).toBe('200')
  })

  it('maps reference to billNumber', () => {
    expect(transformBill(makeRaw()).billNumber).toBe('BILL-2025-001')
  })

  it('falls back to String(id) as billNumber when reference absent', () => {
    expect(transformBill(makeRaw({ reference: null })).billNumber).toBe('200')
  })

  it('maps approved status to AUTHORIZED', () => {
    expect(transformBill(makeRaw({ status: 'approved' })).status).toBe('AUTHORIZED')
  })

  it('maps draft status to DRAFT', () => {
    expect(transformBill(makeRaw({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps paid status to PAID', () => {
    expect(transformBill(makeRaw({ status: 'paid' })).status).toBe('PAID')
  })

  it('maps overdue status to OVERDUE', () => {
    expect(transformBill(makeRaw({ status: 'overdue' })).status).toBe('OVERDUE')
  })

  it('maps voided/cancelled status to VOIDED', () => {
    expect(transformBill(makeRaw({ status: 'voided' })).status).toBe('VOIDED')
    expect(transformBill(makeRaw({ status: 'cancelled' })).status).toBe('VOIDED')
  })

  it('maps vendor_id to contactId as string', () => {
    expect(transformBill(makeRaw()).contactId).toBe('55')
  })

  it('maps currency', () => {
    expect(transformBill(makeRaw()).currency).toBe('SAR')
  })

  it('maps total directly (no ×100 conversion)', () => {
    // Qoyod amounts are whole currency units, passed through as-is
    expect(transformBill(makeRaw()).totalAmount).toBe(1150)
  })

  it('maps tax_total to taxAmount directly', () => {
    expect(transformBill(makeRaw()).taxAmount).toBe(150)
  })

  it('maps paid_amount to paidAmount', () => {
    expect(transformBill(makeRaw()).paidAmount).toBe(0)
  })

  it('maps balance to balanceAmount', () => {
    expect(transformBill(makeRaw()).balanceAmount).toBe(1150)
  })

  it('maps notes', () => {
    expect(transformBill(makeRaw()).notes).toBe('Payment for supplies')
  })

  it('maps date to postedAt Date', () => {
    expect(transformBill(makeRaw()).postedAt).toBeInstanceOf(Date)
  })

  it('maps line_items — line id as string', () => {
    expect(transformBill(makeRaw()).lineItems?.[0]?.id).toBe('1')
  })

  it('maps line_items — product_id to itemId as string', () => {
    expect(transformBill(makeRaw()).lineItems?.[0]?.itemId).toBe('10')
  })

  it('maps line_items — account_id to accountId as string', () => {
    expect(transformBill(makeRaw()).lineItems?.[0]?.accountId).toBe('20')
  })

  it('passes BillSchema.parse', () => {
    expect(() => BillSchema.parse(transformBill(makeRaw()))).not.toThrow()
  })
})
