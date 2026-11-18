import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  type OctopusSalesInvoice,
  type OctopusInvoiceLine,
} from '../../../../../../../src/verticals/accounting/adapters/octopus/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'

const sampleLine: OctopusInvoiceLine = {
  lineId: 1,
  articleNumber: 'ART-001',
  description: 'Product sale',
  unitPrice: 1000,
  quantity: 5,
  totalAmount: 5000,
  vatAmount: 1050,
  accountNumber: '700000',
}

function makeRaw(overrides: Partial<OctopusSalesInvoice> = {}): OctopusSalesInvoice {
  return {
    invoiceId: 8001,
    invoiceNumber: 'SI-2024-001',
    relationId: 300,
    currency: 'EUR',
    totalAmount: 6050,
    vatAmount: 1050,
    remainingAmount: 6050,
    paid: false,
    booked: true,
    cancelled: false,
    creditNote: false,
    invoiceDate: '2024-07-01',
    dueDate: '2024-07-31',
    notes: 'Product delivery',
    lines: [sampleLine],
    ...overrides,
  }
}

describe('transformInvoice (octopus)', () => {
  it('maps invoiceId to id (string)', () => {
    expect(transformInvoice(makeRaw()).id).toBe('8001')
  })

  it('sets type to INVOICE when creditNote is false', () => {
    expect(transformInvoice(makeRaw({ creditNote: false })).type).toBe('INVOICE')
  })

  it('sets type to CREDITMEMO when creditNote is true', () => {
    expect(transformInvoice(makeRaw({ creditNote: true })).type).toBe('CREDITMEMO')
  })

  it('maps invoiceNumber', () => {
    expect(transformInvoice(makeRaw()).invoiceNumber).toBe('SI-2024-001')
  })

  it('maps relationId to contactId (string)', () => {
    expect(transformInvoice(makeRaw()).contactId).toBe('300')
  })

  it('maps booked+remaining>0 to AUTHORIZED', () => {
    expect(
      transformInvoice(makeRaw({ booked: true, paid: false, remainingAmount: 6050 })).status,
    ).toBe('AUTHORIZED')
  })

  it('maps booked+remaining=0 to PAID', () => {
    expect(
      transformInvoice(makeRaw({ booked: true, paid: false, remainingAmount: 0 })).status,
    ).toBe('PAID')
  })

  it('maps cancelled to VOIDED', () => {
    expect(transformInvoice(makeRaw({ cancelled: true })).status).toBe('VOIDED')
  })

  it('maps totalAmount', () => {
    expect(transformInvoice(makeRaw()).totalAmount).toBe(6050)
  })

  it('maps vatAmount to taxAmount', () => {
    expect(transformInvoice(makeRaw()).taxAmount).toBe(1050)
  })

  it('maps remainingAmount to balanceAmount', () => {
    expect(transformInvoice(makeRaw()).balanceAmount).toBe(6050)
  })

  it('maps invoiceDate to postedAt', () => {
    expect(transformInvoice(makeRaw()).postedAt).toEqual(new Date('2024-07-01'))
  })

  it('maps lineitem description', () => {
    expect(transformInvoice(makeRaw()).lineItems![0].itemDescription).toBe('Product sale')
  })

  it('maps lineitem lineId to id (string)', () => {
    expect(transformInvoice(makeRaw()).lineItems![0].id).toBe('1')
  })

  it('passes InvoiceSchema.parse without throwing', () => {
    expect(() => InvoiceSchema.parse(transformInvoice(makeRaw()))).not.toThrow()
  })
})
