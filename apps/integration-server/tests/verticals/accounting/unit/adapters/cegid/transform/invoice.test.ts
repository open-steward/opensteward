import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type CegidInvoice } from '../../../../../../../src/verticals/accounting/adapters/cegid/transform/invoice'

function makeInvoice(overrides: Partial<CegidInvoice> = {}): CegidInvoice {
  return {
    id: '30',
    documentNumber: 'FAC2024-030',
    documentDate: '2024-02-01',
    dueDate: '2024-03-01',
    netAmount: 3000,
    taxAmount: 600,
    grossAmount: 3600,
    openAmount: 3600,
    documentStatus: 'Draft',
    customerId: 'cust_1',
    currency: 'EUR',
    lines: [],
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps core fields', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.id).toBe('30')
    expect(result.invoiceNumber).toBe('FAC2024-030')
    expect(result.totalAmount).toBe(3600)
    expect(result.taxAmount).toBe(600)
    expect(result.balanceAmount).toBe(3600)
    expect(result.type).toBe('INVOICE')
  })

  it('parses dates', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-02-01'))
    expect(result.dueAt).toEqual(new Date('2024-03-01'))
  })

  it('metadata identity', () => {
    const raw = makeInvoice()
    expect(transformInvoice(raw).metadata).toBe(raw)
  })

  it('maps Draft to DRAFT', () => {
    expect(transformInvoice(makeInvoice({ documentStatus: 'Draft' })).status).toBe('DRAFT')
  })

  it('maps Posted to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ documentStatus: 'Posted' })).status).toBe('AUTHORIZED')
  })

  it('maps Paid to PAID', () => {
    expect(transformInvoice(makeInvoice({ documentStatus: 'Paid' })).status).toBe('PAID')
  })

  it('maps Cancelled to VOIDED', () => {
    expect(transformInvoice(makeInvoice({ documentStatus: 'Cancelled' })).status).toBe('VOIDED')
  })

  it('maps lines to lineItems', () => {
    const raw = makeInvoice({
      lines: [{ id: 1, description: 'Software', unitPrice: 300, quantity: 10, netAmount: 3000, taxAmount: 600, accountId: '706' }],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].totalAmount).toBe(3000)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
