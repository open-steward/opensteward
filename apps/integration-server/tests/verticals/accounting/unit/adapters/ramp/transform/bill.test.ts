import { describe, it, expect } from 'vitest'
import {
  transformBill,
  type RampBill,
} from '../../../../../../../src/verticals/accounting/adapters/ramp/transform/bill'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'

function makeBill(overrides: Partial<RampBill> = {}): RampBill {
  return {
    id: 'bill_uuid_001',
    invoice_number: 'INV-2024-001',
    vendor: { id: 'vendor_abc', remote_name: 'Acme Corp' },
    amount: { amount: 75000, currency_code: 'USD' },
    status: 'APPROVED',
    issued_at: '2024-03-01T00:00:00Z',
    due_date: '2024-04-01',
    payment: {
      id: 'pay_001',
      payment_date: '2024-03-20',
      amount: { amount: 75000, currency_code: 'USD' },
    },
    line_items: [
      { id: 'li_001', gl_account_id: 'gl_5000', amount: 75000, memo: 'Office supplies' },
    ],
    created_at: '2024-02-28T10:00:00Z',
    updated_at: '2024-03-20T15:00:00Z',
    ...overrides,
  }
}

describe('transformBill', () => {
  it('maps id', () => {
    expect(transformBill(makeBill()).id).toBe('bill_uuid_001')
  })

  it('maps invoice_number to billNumber', () => {
    expect(transformBill(makeBill()).billNumber).toBe('INV-2024-001')
  })

  it('maps vendor.id to contactId', () => {
    expect(transformBill(makeBill()).contactId).toBe('vendor_abc')
  })

  it('maps amount.currency_code to currency', () => {
    expect(transformBill(makeBill()).currency).toBe('USD')
  })

  it('maps amount.amount to totalAmount without conversion (already minor units)', () => {
    expect(transformBill(makeBill()).totalAmount).toBe(75000)
  })

  it('maps payment.amount.amount to paidAmount', () => {
    expect(transformBill(makeBill()).paidAmount).toBe(75000)
  })

  it('computes balanceAmount = totalAmount - paidAmount', () => {
    const bill = makeBill({
      amount: { amount: 100000, currency_code: 'USD' },
      payment: { amount: { amount: 40000, currency_code: 'USD' } },
    })
    expect(transformBill(bill).balanceAmount).toBe(60000)
  })

  it('maps issued_at to postedAt as Date', () => {
    expect(transformBill(makeBill()).postedAt).toEqual(new Date('2024-03-01T00:00:00Z'))
  })

  it('maps due_date to dueAt as Date', () => {
    expect(transformBill(makeBill()).dueAt).toEqual(new Date('2024-04-01'))
  })

  it('maps payment.payment_date to paidAt as Date', () => {
    expect(transformBill(makeBill()).paidAt).toEqual(new Date('2024-03-20'))
  })

  it('maps created_at to createdAt as Date', () => {
    expect(transformBill(makeBill()).createdAt).toEqual(new Date('2024-02-28T10:00:00Z'))
  })

  it('maps APPROVED status to AUTHORIZED', () => {
    expect(transformBill(makeBill({ status: 'APPROVED' })).status).toBe('AUTHORIZED')
  })

  it('maps PENDING status to AUTHORIZED', () => {
    expect(transformBill(makeBill({ status: 'PENDING' })).status).toBe('AUTHORIZED')
  })

  it('maps PAID status to PAID', () => {
    expect(transformBill(makeBill({ status: 'PAID' })).status).toBe('PAID')
  })

  it('maps DRAFT status to DRAFT', () => {
    expect(transformBill(makeBill({ status: 'DRAFT' })).status).toBe('DRAFT')
  })

  it('maps REJECTED/ARCHIVED/CANCELLED to VOIDED', () => {
    expect(transformBill(makeBill({ status: 'REJECTED' })).status).toBe('VOIDED')
    expect(transformBill(makeBill({ status: 'CANCELLED' })).status).toBe('VOIDED')
  })

  it('maps line_items to lineItems with gl_account_id as accountId', () => {
    const result = transformBill(makeBill())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems?.[0].accountId).toBe('gl_5000')
    expect(result.lineItems?.[0].itemDescription).toBe('Office supplies')
    expect(result.lineItems?.[0].totalAmount).toBe(75000)
  })

  it('passes raw object as metadata', () => {
    const raw = makeBill()
    expect(transformBill(raw).metadata).toBe(raw)
  })

  it('produces output that passes BillSchema validation', () => {
    expect(() => BillSchema.parse(transformBill(makeBill()))).not.toThrow()
  })

  it('produces schema-valid output when optional fields are absent', () => {
    const result = transformBill({ id: 'bill_001' })
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})
