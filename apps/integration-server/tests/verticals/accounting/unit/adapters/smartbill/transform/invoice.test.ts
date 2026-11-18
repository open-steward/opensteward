import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type SmartbillInvoice } from '../../../../../../../src/verticals/accounting/adapters/smartbill/transform/invoice'

function makeInvoice(overrides: Partial<SmartbillInvoice> = {}): SmartbillInvoice {
  return {
    id: '200',
    seriesName: 'FCT',
    number: '0042',
    issueDate: '2024-06-01',
    dueDate: '2024-06-30',
    totalAmount: 5000,
    totalTax: 800,
    status: 'DRAFT',
    clientCif: 'RO12345678',
    currency: 'RON',
    ...overrides,
  }
}

describe('transformInvoice (smartbill)', () => {
  it('maps id', () => {
    expect(transformInvoice(makeInvoice()).id).toBe('200')
  })

  it('sets type to INVOICE', () => {
    expect(transformInvoice(makeInvoice()).type).toBe('INVOICE')
  })

  it('combines seriesName and number for invoiceNumber', () => {
    expect(transformInvoice(makeInvoice()).invoiceNumber).toBe('FCT0042')
  })

  it('uses number only when no seriesName', () => {
    expect(transformInvoice(makeInvoice({ seriesName: undefined })).invoiceNumber).toBe('0042')
  })

  it('maps totalAmount', () => {
    expect(transformInvoice(makeInvoice()).totalAmount).toBe(5000)
  })

  it('maps DRAFT status', () => {
    expect(transformInvoice(makeInvoice({ status: 'DRAFT' })).status).toBe('DRAFT')
  })

  it('maps AUTHORIZED status for ISSUED', () => {
    expect(transformInvoice(makeInvoice({ status: 'ISSUED' })).status).toBe('AUTHORIZED')
  })

  it('maps PAID status', () => {
    expect(transformInvoice(makeInvoice({ status: 'PAID' })).status).toBe('PAID')
  })

  it('maps VOIDED status for CANCELLED', () => {
    expect(transformInvoice(makeInvoice({ status: 'CANCELLED' })).status).toBe('VOIDED')
  })

  it('maps clientCif to contactId', () => {
    expect(transformInvoice(makeInvoice()).contactId).toBe('RO12345678')
  })

  it('metadata identity', () => {
    const raw = makeInvoice()
    expect(transformInvoice(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
