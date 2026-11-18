import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type YonyouInvoice } from '../../../../../../../src/verticals/accounting/adapters/yonyou/transform/invoice'

function makeInvoice(overrides: Partial<YonyouInvoice> = {}): YonyouInvoice {
  return {
    id: 'yy-001',
    code: 'YY-2024-001',
    vouchdate: '2024-01-15',
    duedate: '2024-02-15',
    ttaxmny: 1230,
    tax: 230,
    status: 1,
    custid: 'cust-42',
    currency: 'CNY',
    lines: [],
    ...overrides,
  }
}

describe('transformInvoice (yonyou)', () => {
  it('maps id field', () => {
    expect(transformInvoice(makeInvoice()).id).toBe('yy-001')
  })

  it('sets type to INVOICE', () => {
    expect(transformInvoice(makeInvoice()).type).toBe('INVOICE')
  })

  it('maps invoice number from code', () => {
    expect(transformInvoice(makeInvoice()).invoiceNumber).toBe('YY-2024-001')
  })

  it('maps total amount from ttaxmny', () => {
    expect(transformInvoice(makeInvoice()).totalAmount).toBe(1230)
  })

  it('maps tax amount from tax', () => {
    expect(transformInvoice(makeInvoice()).taxAmount).toBe(230)
  })

  it('maps AUTHORIZED status for 1', () => {
    expect(transformInvoice(makeInvoice({ status: 1 })).status).toBe('AUTHORIZED')
  })

  it('maps PAID status for 2', () => {
    expect(transformInvoice(makeInvoice({ status: 2 })).status).toBe('PAID')
  })

  it('maps VOIDED status for 3', () => {
    expect(transformInvoice(makeInvoice({ status: 3 })).status).toBe('VOIDED')
  })

  it('maps DRAFT status for 0', () => {
    expect(transformInvoice(makeInvoice({ status: 0 })).status).toBe('DRAFT')
  })

  it('maps contactId from custid', () => {
    expect(transformInvoice(makeInvoice()).contactId).toBe('cust-42')
  })

  it('maps currency field', () => {
    expect(transformInvoice(makeInvoice()).currency).toBe('CNY')
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
