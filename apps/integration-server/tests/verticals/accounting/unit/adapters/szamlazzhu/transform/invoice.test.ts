import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type SzamlazzhuInvoice } from '../../../../../../../src/verticals/accounting/adapters/szamlazzhu/transform/invoice'

function makeInvoice(overrides: Partial<SzamlazzhuInvoice> = {}): SzamlazzhuInvoice {
  return {
    id: '400',
    invoiceNumber: 'NYB-2024-400',
    issueDate: '2024-08-01',
    paymentDate: '2024-08-31',
    grossTotal: 7500,
    vatTotal: 1500,
    status: 'DRAFT',
    partnerId: '120',
    currency: 'HUF',
    ...overrides,
  }
}

describe('transformInvoice (szamlazzhu)', () => {
  it('maps id', () => {
    expect(transformInvoice(makeInvoice()).id).toBe('400')
  })

  it('sets type to INVOICE', () => {
    expect(transformInvoice(makeInvoice()).type).toBe('INVOICE')
  })

  it('maps invoiceNumber', () => {
    expect(transformInvoice(makeInvoice()).invoiceNumber).toBe('NYB-2024-400')
  })

  it('maps grossTotal to totalAmount', () => {
    expect(transformInvoice(makeInvoice()).totalAmount).toBe(7500)
  })

  it('maps vatTotal to taxAmount', () => {
    expect(transformInvoice(makeInvoice()).taxAmount).toBe(1500)
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

  it('maps VOIDED status for STORNO', () => {
    expect(transformInvoice(makeInvoice({ status: 'STORNO' })).status).toBe('VOIDED')
  })

  it('maps partnerId to contactId', () => {
    expect(transformInvoice(makeInvoice()).contactId).toBe('120')
  })

  it('maps paymentDate to dueAt', () => {
    expect(transformInvoice(makeInvoice()).dueAt).toEqual(new Date('2024-08-31'))
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
