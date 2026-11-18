import { describe, it, expect } from 'vitest'
import {
  transformBill,
  type OctopusPurchaseInvoice,
} from '../../../../../../../src/verticals/accounting/adapters/octopus/transform/bill'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'

function makeRaw(overrides: Partial<OctopusPurchaseInvoice> = {}): OctopusPurchaseInvoice {
  return {
    purchaseInvoiceId: 5001,
    invoiceNumber: 'PI-001',
    supplierInvoiceNumber: 'VEND-INV-100',
    relationId: 200,
    currency: 'EUR',
    totalAmount: 12100,
    vatAmount: 2100,
    remainingAmount: 0,
    paidAmount: 12100,
    paid: true,
    booked: true,
    cancelled: false,
    invoiceDate: '2024-05-01',
    dueDate: '2024-05-31',
    notes: 'Monthly services',
    ...overrides,
  }
}

describe('transformBill (octopus)', () => {
  it('maps purchaseInvoiceId to id (string)', () => {
    expect(transformBill(makeRaw()).id).toBe('5001')
  })

  it('prefers supplierInvoiceNumber over invoiceNumber for billNumber', () => {
    expect(transformBill(makeRaw()).billNumber).toBe('VEND-INV-100')
  })

  it('falls back to invoiceNumber when supplierInvoiceNumber absent', () => {
    expect(transformBill(makeRaw({ supplierInvoiceNumber: undefined })).billNumber).toBe('PI-001')
  })

  it('maps relationId to contactId (string)', () => {
    expect(transformBill(makeRaw()).contactId).toBe('200')
  })

  it('maps currency', () => {
    expect(transformBill(makeRaw()).currency).toBe('EUR')
  })

  it('maps paid+booked to PAID status', () => {
    expect(transformBill(makeRaw({ paid: true, booked: true })).status).toBe('PAID')
  })

  it('maps cancelled to VOIDED status', () => {
    expect(transformBill(makeRaw({ cancelled: true })).status).toBe('VOIDED')
  })

  it('maps booked+remaining=0 to PAID', () => {
    expect(transformBill(makeRaw({ paid: false, booked: true, remainingAmount: 0 })).status).toBe(
      'PAID',
    )
  })

  it('maps unbooked to DRAFT', () => {
    expect(transformBill(makeRaw({ booked: false, paid: false })).status).toBe('DRAFT')
  })

  it('maps totalAmount', () => {
    expect(transformBill(makeRaw()).totalAmount).toBe(12100)
  })

  it('maps vatAmount to taxAmount', () => {
    expect(transformBill(makeRaw()).taxAmount).toBe(2100)
  })

  it('maps invoiceDate to postedAt', () => {
    expect(transformBill(makeRaw()).postedAt).toEqual(new Date('2024-05-01'))
  })

  it('passes BillSchema.parse without throwing', () => {
    expect(() => BillSchema.parse(transformBill(makeRaw()))).not.toThrow()
  })
})
