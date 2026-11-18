import { describe, it, expect } from 'vitest'
import {
  transformBill,
  type CampfireBill,
  type CampfireBillLine,
} from '../../../../../../../src/verticals/accounting/adapters/campfire/transform/bill'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'

function makeBillLine(overrides: Partial<CampfireBillLine> = {}): CampfireBillLine {
  return {
    id: 1,
    account: 10,
    account_name: 'Office Supplies',
    amount: 50.0,
    description: 'Paper reams',
    tax: 5.0,
    ...overrides,
  }
}

function makeBill(overrides: Partial<CampfireBill> = {}): CampfireBill {
  return {
    id: 99,
    bill_number: 'BILL-099',
    bill_date: '2024-03-01',
    due_date: '2024-04-01',
    created_at: '2024-02-28T10:00:00Z',
    last_modified_at: '2024-03-01T12:00:00Z',
    vendor: 7,
    currency: 'USD',
    total_amount: 55.0,
    amount_paid: 0.0,
    amount_due: 55.0,
    payment_status: 'open',
    lines: [],
    ...overrides,
  }
}

describe('transformBill', () => {
  it('maps id to string', () => {
    expect(transformBill(makeBill()).id).toBe('99')
  })

  it('maps bill_number to billNumber', () => {
    expect(transformBill(makeBill()).billNumber).toBe('BILL-099')
  })

  it('maps vendor to contactId as string', () => {
    expect(transformBill(makeBill()).contactId).toBe('7')
  })

  it('maps currency', () => {
    expect(transformBill(makeBill()).currency).toBe('USD')
  })

  it('converts total_amount to minor units', () => {
    expect(transformBill(makeBill({ total_amount: 55.0 })).totalAmount).toBe(5500)
  })

  it('converts amount_paid to minor units', () => {
    expect(transformBill(makeBill({ amount_paid: 10.0 })).paidAmount).toBe(1000)
  })

  it('converts amount_due to minor units', () => {
    expect(transformBill(makeBill({ amount_due: 55.0 })).balanceAmount).toBe(5500)
  })

  it('maps payment_status open to AUTHORIZED', () => {
    expect(transformBill(makeBill({ payment_status: 'open' })).status).toBe('AUTHORIZED')
  })

  it('maps payment_status paid to PAID', () => {
    expect(transformBill(makeBill({ payment_status: 'paid' })).status).toBe('PAID')
  })

  it('maps payment_status partial to PARTIALLY_PAID', () => {
    expect(transformBill(makeBill({ payment_status: 'partial' })).status).toBe('PARTIALLY_PAID')
  })

  it('maps payment_status voided to VOIDED', () => {
    expect(transformBill(makeBill({ payment_status: 'voided' })).status).toBe('VOIDED')
  })

  it('maps payment_status payment_pending to SUBMITTED', () => {
    expect(transformBill(makeBill({ payment_status: 'payment_pending' })).status).toBe('SUBMITTED')
  })

  it('maps payment_status payment_not_found to SUBMITTED', () => {
    expect(transformBill(makeBill({ payment_status: 'payment_not_found' })).status).toBe(
      'SUBMITTED',
    )
  })

  it('maps unknown payment_status to DRAFT', () => {
    expect(transformBill(makeBill({ payment_status: null })).status).toBe('DRAFT')
  })

  it('maps bill_date to postedAt Date', () => {
    expect(transformBill(makeBill()).postedAt).toEqual(new Date('2024-03-01'))
  })

  it('maps due_date to dueAt Date', () => {
    expect(transformBill(makeBill()).dueAt).toEqual(new Date('2024-04-01'))
  })

  it('maps voided_date to cancelledAt Date', () => {
    const result = transformBill(makeBill({ voided_date: '2024-05-01' }))
    expect(result.cancelledAt).toEqual(new Date('2024-05-01'))
  })

  it('leaves cancelledAt undefined when voided_date is absent', () => {
    expect(transformBill(makeBill()).cancelledAt).toBeUndefined()
  })

  it('maps created_at to createdAt Date', () => {
    expect(transformBill(makeBill()).createdAt).toEqual(new Date('2024-02-28T10:00:00Z'))
  })

  it('maps last_modified_at to updatedAt Date', () => {
    expect(transformBill(makeBill()).updatedAt).toEqual(new Date('2024-03-01T12:00:00Z'))
  })

  it('maps line items', () => {
    const raw = makeBill({ lines: [makeBillLine()] })
    const result = transformBill(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('1')
    expect(li.accountId).toBe('10')
    expect(li.itemDescription).toBe('Paper reams')
    expect(li.totalAmount).toBe(5000)
    expect(li.taxAmount).toBe(500)
  })

  it('defaults to empty lineItems array when lines is absent', () => {
    const result = transformBill(makeBill({ lines: undefined }))
    expect(result.lineItems).toEqual([])
  })

  it('passes raw object as metadata', () => {
    const raw = makeBill()
    expect(transformBill(raw).metadata).toBe(raw)
  })

  it('output passes schema validation', () => {
    expect(() => BillSchema.parse(transformBill(makeBill()))).not.toThrow()
  })
})
