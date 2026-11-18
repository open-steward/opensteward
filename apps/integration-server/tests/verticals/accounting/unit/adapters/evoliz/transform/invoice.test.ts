import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type EvolizInvoice } from '../../../../../../../src/verticals/accounting/adapters/evoliz/transform/invoice'

function makeInvoice(overrides: Partial<EvolizInvoice> = {}): EvolizInvoice {
  return {
    id: '70',
    invoice_no: 'EVZ-2024-070',
    invoice_date: '2024-05-01',
    due_date: '2024-06-01',
    total_without_taxes: 2000,
    total_taxes: 400,
    total_with_taxes: 2400,
    balance_due: 2400,
    invoice_status: 'DRAFT',
    client_id: 'cl_3',
    currency: 'EUR',
    items: [],
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps core fields', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.id).toBe('70')
    expect(result.invoiceNumber).toBe('EVZ-2024-070')
    expect(result.totalAmount).toBe(2400)
    expect(result.taxAmount).toBe(400)
    expect(result.balanceAmount).toBe(2400)
    expect(result.type).toBe('INVOICE')
  })

  it('parses dates', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-05-01'))
    expect(result.dueAt).toEqual(new Date('2024-06-01'))
  })

  it('metadata identity', () => {
    const raw = makeInvoice()
    expect(transformInvoice(raw).metadata).toBe(raw)
  })

  it('maps DRAFT status', () => {
    expect(transformInvoice(makeInvoice({ invoice_status: 'DRAFT' })).status).toBe('DRAFT')
  })

  it('maps SENT to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ invoice_status: 'SENT' })).status).toBe('AUTHORIZED')
  })

  it('maps PAID status', () => {
    expect(transformInvoice(makeInvoice({ invoice_status: 'PAID' })).status).toBe('PAID')
  })

  it('maps CANCELLED to VOIDED', () => {
    expect(transformInvoice(makeInvoice({ invoice_status: 'CANCELLED' })).status).toBe('VOIDED')
  })

  it('maps items to lineItems', () => {
    const raw = makeInvoice({
      items: [{ id: 1, designation: 'Formation', unit_price: 200, quantity: 10, total_without_taxes: 2000, total_taxes: 400, account_code: '706' }],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].totalAmount).toBe(2000)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
