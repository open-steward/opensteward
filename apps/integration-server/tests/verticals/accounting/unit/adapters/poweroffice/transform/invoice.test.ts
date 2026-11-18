import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import {
  transformInvoice,
  type PowerOfficeInvoice,
  type PowerOfficeLine,
} from '../../../../../../../src/verticals/accounting/adapters/poweroffice/transform/invoice'

function makeInvoice(overrides: Partial<PowerOfficeInvoice> = {}): PowerOfficeInvoice {
  return {
    id: 101,
    orderNo: 'INV-2024-001',
    customerId: 20,
    invoiceDate: '2024-03-01',
    dueDate: '2024-03-31',
    currencyCode: 'NOK',
    grossAmount: 1190,
    netAmount: 1000,
    vatAmount: 190,
    isPaid: false,
    isVoid: false,
    status: 5,
    lines: [],
    ...overrides,
  }
}

function makeLine(overrides: Partial<PowerOfficeLine> = {}): PowerOfficeLine {
  return {
    id: 1,
    description: 'Consulting',
    quantity: 2,
    unitPrice: 500,
    amount: 1000,
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps id correctly', () => {
    expect(transformInvoice(makeInvoice()).id).toBe('101')
  })

  it('maps orderNo to invoiceNumber', () => {
    expect(transformInvoice(makeInvoice()).invoiceNumber).toBe('INV-2024-001')
  })

  it('maps customerId to contactId', () => {
    expect(transformInvoice(makeInvoice()).contactId).toBe('20')
  })

  it('maps currencyCode to currency', () => {
    expect(transformInvoice(makeInvoice()).currency).toBe('NOK')
  })

  it('maps grossAmount to totalAmount', () => {
    expect(transformInvoice(makeInvoice()).totalAmount).toBe(1190)
  })

  it('maps vatAmount to taxAmount', () => {
    expect(transformInvoice(makeInvoice()).taxAmount).toBe(190)
  })

  it('sets type to INVOICE', () => {
    expect(transformInvoice(makeInvoice()).type).toBe('INVOICE')
  })

  it('parses invoiceDate as Date object for postedAt', () => {
    expect(transformInvoice(makeInvoice()).postedAt).toEqual(new Date('2024-03-01'))
  })

  it('parses dueDate as Date object for dueAt', () => {
    expect(transformInvoice(makeInvoice()).dueAt).toEqual(new Date('2024-03-31'))
  })

  it('maps isVoid true to VOIDED', () => {
    expect(transformInvoice(makeInvoice({ isVoid: true, isPaid: true, status: 5 })).status).toBe('VOIDED')
  })

  it('maps isPaid true (not void) to PAID', () => {
    expect(transformInvoice(makeInvoice({ isVoid: false, isPaid: true, status: 5 })).status).toBe('PAID')
  })

  it('maps status 5 (not paid, not void) to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ isVoid: false, isPaid: false, status: 5 })).status).toBe('AUTHORIZED')
  })

  it('maps status 0 (not paid, not void) to DRAFT', () => {
    expect(transformInvoice(makeInvoice({ isVoid: false, isPaid: false, status: 0 })).status).toBe('DRAFT')
  })

  it('maps other status (not paid, not void) to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ isVoid: false, isPaid: false, status: 3 })).status).toBe('AUTHORIZED')
  })

  it('maps lines to lineItems', () => {
    const line = makeLine()
    const result = transformInvoice(makeInvoice({ lines: [line] }))
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0]).toEqual({
      id: '1',
      itemDescription: 'Consulting',
      unitAmount: 500,
      unitQuantity: 2,
      totalAmount: 1000,
    })
  })

  it('produces empty lineItems array when lines is undefined', () => {
    const result = transformInvoice(makeInvoice({ lines: undefined }))
    expect(result.lineItems).toEqual([])
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeInvoice()
    expect(transformInvoice(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
