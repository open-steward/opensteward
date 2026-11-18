import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type AxonautInvoice } from '../../../../../../../src/verticals/accounting/adapters/axonaut/transform/invoice'

function makeInvoice(overrides: Partial<AxonautInvoice> = {}): AxonautInvoice {
  return {
    id: '42',
    number: 'AXO-2024-042',
    creation_date: '2024-03-01',
    payment_deadline: '2024-04-01',
    pretax_amount: 1000,
    taxes_amount: 200,
    total_amount: 1200,
    remaining_amount: 1200,
    status: 'draft',
    company_id: 'cmp_7',
    currency: 'EUR',
    lines: [],
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps core fields', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.id).toBe('42')
    expect(result.invoiceNumber).toBe('AXO-2024-042')
    expect(result.contactId).toBe('cmp_7')
    expect(result.totalAmount).toBe(1200)
    expect(result.taxAmount).toBe(200)
    expect(result.balanceAmount).toBe(1200)
    expect(result.currency).toBe('EUR')
    expect(result.type).toBe('INVOICE')
  })

  it('parses dates', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
    expect(result.dueAt).toEqual(new Date('2024-04-01'))
  })

  it('metadata identity', () => {
    const raw = makeInvoice()
    expect(transformInvoice(raw).metadata).toBe(raw)
  })

  it('maps draft status to DRAFT', () => {
    expect(transformInvoice(makeInvoice({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps sent to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ status: 'sent' })).status).toBe('AUTHORIZED')
  })

  it('maps paid to PAID', () => {
    expect(transformInvoice(makeInvoice({ status: 'paid' })).status).toBe('PAID')
  })

  it('maps cancelled to VOIDED', () => {
    expect(transformInvoice(makeInvoice({ status: 'cancelled' })).status).toBe('VOIDED')
  })

  it('maps lines to lineItems', () => {
    const raw = makeInvoice({
      lines: [
        {
          id: 1,
          description: 'Consulting',
          unit_price: 100,
          quantity: 10,
          pretax_amount: 1000,
          taxes_amount: 200,
          account_id: '706',
        },
      ],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('1')
    expect(li.itemDescription).toBe('Consulting')
    expect(li.unitAmount).toBe(100)
    expect(li.unitQuantity).toBe(10)
    expect(li.totalAmount).toBe(1000)
    expect(li.taxAmount).toBe(200)
    expect(li.accountId).toBe('706')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
