import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import {
  transformBill,
  type AccountEdgeBill,
} from '../../../../../../../src/verticals/accounting/adapters/accountedge/transform/bill'

function makeBill(overrides: Partial<AccountEdgeBill> = {}): AccountEdgeBill {
  return {
    id: 'bill-001',
    bill_number: 'BILL-2024-001',
    contact_id: 'ct-100',
    currency: 'USD',
    subtotal: 1000,
    tax_amount: 100,
    total: 1100,
    amount_paid: 500,
    date: '2024-01-15',
    due_date: '2024-02-15',
    status: 'approved',
    ...overrides,
  }
}

describe('transformBill', () => {
  it('maps id from raw id', () => {
    expect(transformBill(makeBill()).id).toBe('bill-001')
  })

  it('maps bill_number to billNumber', () => {
    expect(transformBill(makeBill()).billNumber).toBe('BILL-2024-001')
  })

  it('maps contact_id to contactId', () => {
    expect(transformBill(makeBill()).contactId).toBe('ct-100')
  })

  it('maps currency', () => {
    expect(transformBill(makeBill()).currency).toBe('USD')
  })

  it('maps total to totalAmount', () => {
    expect(transformBill(makeBill()).totalAmount).toBe(1100)
  })

  it('maps tax_amount to taxAmount', () => {
    expect(transformBill(makeBill()).taxAmount).toBe(100)
  })

  it('computes balanceAmount as total minus amount_paid', () => {
    expect(transformBill(makeBill()).balanceAmount).toBe(600)
  })

  it('maps amount_paid to paidAmount', () => {
    expect(transformBill(makeBill()).paidAmount).toBe(500)
  })

  it('parses date to postedAt', () => {
    const result = transformBill(makeBill())
    expect(result.postedAt).toEqual(new Date('2024-01-15'))
  })

  it('parses due_date to dueAt', () => {
    const result = transformBill(makeBill())
    expect(result.dueAt).toEqual(new Date('2024-02-15'))
  })

  it('returns undefined postedAt when date is empty', () => {
    expect(transformBill(makeBill({ date: '' })).postedAt).toBeUndefined()
  })

  it('returns undefined dueAt when due_date is empty', () => {
    expect(transformBill(makeBill({ due_date: '' })).dueAt).toBeUndefined()
  })

  it('maps status "void" to VOIDED', () => {
    expect(transformBill(makeBill({ status: 'void' })).status).toBe('VOIDED')
  })

  it('maps status "paid" to PAID', () => {
    expect(transformBill(makeBill({ status: 'paid' })).status).toBe('PAID')
  })

  it('maps status "partial" to PARTIALLY_PAID', () => {
    expect(transformBill(makeBill({ status: 'partial' })).status).toBe('PARTIALLY_PAID')
  })

  it('maps status "approved" to AUTHORIZED', () => {
    expect(transformBill(makeBill({ status: 'approved' })).status).toBe('AUTHORIZED')
  })

  it('maps status "draft" to DRAFT', () => {
    expect(transformBill(makeBill({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps unknown status to SUBMITTED', () => {
    expect(transformBill(makeBill({ status: 'open' })).status).toBe('SUBMITTED')
  })

  it('returns undefined billNumber when bill_number is empty', () => {
    expect(transformBill(makeBill({ bill_number: '' })).billNumber).toBeUndefined()
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
