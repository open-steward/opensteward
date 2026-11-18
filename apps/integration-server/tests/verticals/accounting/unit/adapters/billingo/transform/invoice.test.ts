import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type BillingoInvoice } from '../../../../../../../src/verticals/accounting/adapters/billingo/transform/invoice'

function makeInvoice(overrides: Partial<BillingoInvoice> = {}): BillingoInvoice {
  return {
    id: '300',
    invoice_number: 'BIL-2024-300',
    invoice_date: '2024-07-01',
    fulfillment_date: '2024-07-15',
    gross_total: 6200,
    net_total: 5000,
    vat_total: 1200,
    status: 'draft',
    partner_id: '88',
    currency: 'HUF',
    ...overrides,
  }
}

describe('transformInvoice (billingo)', () => {
  it('maps id', () => {
    expect(transformInvoice(makeInvoice()).id).toBe('300')
  })

  it('sets type to INVOICE', () => {
    expect(transformInvoice(makeInvoice()).type).toBe('INVOICE')
  })

  it('maps invoice_number', () => {
    expect(transformInvoice(makeInvoice()).invoiceNumber).toBe('BIL-2024-300')
  })

  it('maps gross_total to totalAmount', () => {
    expect(transformInvoice(makeInvoice()).totalAmount).toBe(6200)
  })

  it('maps vat_total to taxAmount', () => {
    expect(transformInvoice(makeInvoice()).taxAmount).toBe(1200)
  })

  it('maps DRAFT status', () => {
    expect(transformInvoice(makeInvoice({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps AUTHORIZED status for issued', () => {
    expect(transformInvoice(makeInvoice({ status: 'issued' })).status).toBe('AUTHORIZED')
  })

  it('maps PAID status', () => {
    expect(transformInvoice(makeInvoice({ status: 'paid' })).status).toBe('PAID')
  })

  it('maps VOIDED status for cancelled', () => {
    expect(transformInvoice(makeInvoice({ status: 'cancelled' })).status).toBe('VOIDED')
  })

  it('maps fulfillment_date to dueAt', () => {
    expect(transformInvoice(makeInvoice()).dueAt).toEqual(new Date('2024-07-15'))
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
