import { describe, it, expect } from 'vitest'
import {
  transformBill,
  type CalxaBill,
} from '../../../../../../../src/verticals/accounting/adapters/calxa/transform/bill'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'

function makeBill(overrides: Partial<CalxaBill> = {}): CalxaBill {
  return {
    id: 'bill-001',
    billNumber: 'BILL-001',
    contactId: 'contact-42',
    status: 'authorised',
    currency: 'USD',
    total: 1000,
    totalTax: 100,
    amountDue: 1000,
    amountPaid: 0,
    date: '2024-03-15',
    dueDate: '2024-04-15',
    ...overrides,
  }
}

describe('transformBill', () => {
  it('maps id as-is', () => {
    expect(transformBill(makeBill()).id).toBe('bill-001')
  })

  it('maps billNumber', () => {
    expect(transformBill(makeBill()).billNumber).toBe('BILL-001')
  })

  it('maps contactId', () => {
    expect(transformBill(makeBill()).contactId).toBe('contact-42')
  })

  it('maps currency', () => {
    expect(transformBill(makeBill()).currency).toBe('USD')
  })

  it('maps total to totalAmount', () => {
    expect(transformBill(makeBill()).totalAmount).toBe(1000)
  })

  it('maps totalTax to taxAmount', () => {
    expect(transformBill(makeBill()).taxAmount).toBe(100)
  })

  it('maps amountDue to balanceAmount', () => {
    expect(transformBill(makeBill()).balanceAmount).toBe(1000)
  })

  it('maps amountPaid to paidAmount', () => {
    expect(transformBill(makeBill()).paidAmount).toBe(0)
  })

  it('maps date to postedAt as Date', () => {
    expect(transformBill(makeBill()).postedAt).toEqual(new Date('2024-03-15'))
  })

  it('maps dueDate to dueAt as Date', () => {
    expect(transformBill(makeBill()).dueAt).toEqual(new Date('2024-04-15'))
  })

  it('returns undefined postedAt when date is undefined', () => {
    expect(transformBill(makeBill({ date: undefined })).postedAt).toBeUndefined()
  })

  it('maps status authorised to AUTHORIZED', () => {
    expect(transformBill(makeBill({ status: 'authorised' })).status).toBe('AUTHORIZED')
  })

  it('maps status authorized to AUTHORIZED', () => {
    expect(transformBill(makeBill({ status: 'authorized' })).status).toBe('AUTHORIZED')
  })

  it('maps status paid to PAID', () => {
    expect(transformBill(makeBill({ status: 'paid' })).status).toBe('PAID')
  })

  it('maps status voided to VOIDED', () => {
    expect(transformBill(makeBill({ status: 'voided' })).status).toBe('VOIDED')
  })

  it('maps status void to VOIDED', () => {
    expect(transformBill(makeBill({ status: 'void' })).status).toBe('VOIDED')
  })

  it('maps status deleted to DELETED', () => {
    expect(transformBill(makeBill({ status: 'deleted' })).status).toBe('DELETED')
  })

  it('maps status draft to DRAFT', () => {
    expect(transformBill(makeBill({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps unknown status to DRAFT', () => {
    expect(transformBill(makeBill({ status: 'unknown_status' })).status).toBe('DRAFT')
  })

  it('maps undefined status to DRAFT', () => {
    expect(transformBill(makeBill({ status: undefined })).status).toBe('DRAFT')
  })

  it('maps createdAt to Date', () => {
    const result = transformBill(makeBill({ createdAt: '2024-01-15T09:30:00Z' }))
    expect(result.createdAt).toEqual(new Date('2024-01-15T09:30:00Z'))
  })

  it('maps updatedAt to Date', () => {
    const result = transformBill(makeBill({ updatedAt: '2024-02-01T14:20:00Z' }))
    expect(result.updatedAt).toEqual(new Date('2024-02-01T14:20:00Z'))
  })

  it('passes raw object as metadata', () => {
    const raw = makeBill()
    expect(transformBill(raw).metadata).toBe(raw)
  })

  it('output passes schema validation', () => {
    expect(() => BillSchema.parse(transformBill(makeBill()))).not.toThrow()
  })
})
