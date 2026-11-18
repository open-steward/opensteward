import { describe, it, expect } from 'vitest'
import {
  transformBill,
  type StampliInvoice,
} from '../../../../../../../src/verticals/accounting/adapters/stampli/transform/bill'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'

function makeRaw(overrides: Partial<StampliInvoice> = {}): StampliInvoice {
  return {
    id: 'inv-001',
    invoiceNumber: 'INV-2024-001',
    vendorId: 'vendor-42',
    status: 'APPROVED',
    invoiceDate: '2024-02-01T00:00:00.000Z',
    dueDate: '2024-03-03T00:00:00.000Z',
    totalAmount: 1250.0,
    taxAmount: 100.0,
    amountDue: 1250.0,
    amountPaid: 0,
    currency: 'USD',
    description: 'Office supplies',
    lineItems: [
      {
        id: 'li-1',
        glAccountId: 'acct-exp',
        description: 'Paper',
        quantity: 5,
        unitPrice: 250.0,
        amount: 1250.0,
      },
    ],
    createdAt: '2024-01-15T09:30:00.000Z',
    updatedAt: '2024-02-01T14:20:00.000Z',
    ...overrides,
  }
}

describe('stampli transformBill', () => {
  it('maps id', () => {
    expect(transformBill(makeRaw()).id).toBe('inv-001')
  })

  it('maps invoiceNumber to billNumber', () => {
    expect(transformBill(makeRaw()).billNumber).toBe('INV-2024-001')
  })

  it('maps vendorId to contactId', () => {
    expect(transformBill(makeRaw()).contactId).toBe('vendor-42')
  })

  it('maps APPROVED status to AUTHORIZED', () => {
    expect(transformBill(makeRaw({ status: 'APPROVED' })).status).toBe('AUTHORIZED')
  })

  it('maps PAID status', () => {
    expect(transformBill(makeRaw({ status: 'PAID' })).status).toBe('PAID')
  })

  it('maps VOIDED status', () => {
    expect(transformBill(makeRaw({ status: 'VOIDED' })).status).toBe('VOIDED')
  })

  it('maps DRAFT as default', () => {
    expect(transformBill(makeRaw({ status: 'NEW' })).status).toBe('DRAFT')
  })

  it('maps PARTIAL to PARTIALLY_PAID', () => {
    expect(transformBill(makeRaw({ status: 'PARTIAL' })).status).toBe('PARTIALLY_PAID')
  })

  it('maps currency', () => {
    expect(transformBill(makeRaw()).currency).toBe('USD')
  })

  it('maps totalAmount', () => {
    expect(transformBill(makeRaw()).totalAmount).toBe(1250.0)
  })

  it('maps amountDue to balanceAmount', () => {
    expect(transformBill(makeRaw()).balanceAmount).toBe(1250.0)
  })

  it('maps description to notes', () => {
    expect(transformBill(makeRaw()).notes).toBe('Office supplies')
  })

  it('maps invoiceDate to postedAt as Date', () => {
    expect(transformBill(makeRaw()).postedAt).toEqual(new Date('2024-02-01T00:00:00.000Z'))
  })

  it('maps dueDate to dueAt as Date', () => {
    expect(transformBill(makeRaw()).dueAt).toEqual(new Date('2024-03-03T00:00:00.000Z'))
  })

  it('maps line items', () => {
    const result = transformBill(makeRaw())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].accountId).toBe('acct-exp')
    expect(result.lineItems![0].totalAmount).toBe(1250.0)
  })

  it('maps line item unitQuantity rounding', () => {
    const result = transformBill(makeRaw({ lineItems: [{ quantity: 2.9, amount: 100 }] }))
    expect(result.lineItems![0].unitQuantity).toBe(3)
  })

  it('passes BillSchema validation', () => {
    expect(() => BillSchema.parse(transformBill(makeRaw()))).not.toThrow()
  })

  it('preserves raw as metadata', () => {
    const raw = makeRaw()
    expect(transformBill(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformBill({ id: 'inv-min' })).not.toThrow()
  })
})
