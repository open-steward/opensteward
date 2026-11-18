import { describe, it, expect } from 'vitest'
import { transformInvoice } from '../../../../../../../src/verticals/payments/adapters/stark-bank/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/payments/schema/invoice'
import { DOC_INVOICE } from '../fixtures/docs'

describe('stark-bank transformInvoice', () => {
  it('maps the documented list example', () => {
    const result = InvoiceSchema.parse(transformInvoice(DOC_INVOICE))
    expect(result).toMatchObject({
      id: '4600131349381120',
      externalId: '4600131349381120',
      customerId: '012.345.678-90',
      status: 'open',
      currency: 'BRL',
      subtotal: 400000,
      total: 400000,
      dueDate: '2020-05-12T17:59:26.000Z',
      hostedInvoiceUrl: DOC_INVOICE.link,
      invoicePdfUrl: DOC_INVOICE.pdf,
      gateway: 'stark-bank',
      metadata: { tags: 'War supply,Invoice #1234' },
      createdAt: '2020-10-26T01:50:50.264Z',
      updatedAt: '2020-10-26T01:50:50.264Z',
    })
    expect(result.amountPaid).toBeUndefined()
    expect(result.number).toBeUndefined()
  })

  it.each([
    ['created', 'open'],
    ['overdue', 'open'],
    ['paid', 'paid'],
    ['canceled', 'void'],
    ['voided', 'void'],
    ['expired', 'uncollectible'],
    ['something-new', 'unknown'],
  ])('maps status %s to %s', (status, expected) => {
    const result = InvoiceSchema.parse(transformInvoice({ ...DOC_INVOICE, status }))
    expect(result.status).toBe(expected)
  })

  it('reports the amount as paid only once the invoice is paid', () => {
    const result = InvoiceSchema.parse(
      transformInvoice({ ...DOC_INVOICE, status: 'paid', amount: 412000 }),
    )
    expect(result.amountPaid).toBe(412000)
    expect(result.total).toBe(412000)
    // "nominalAmount ... Invoice amount in cents without fine or interest."
    expect(result.subtotal).toBe(400000)
  })

  it('refuses a record without an id or amount instead of inventing one', () => {
    expect(() => transformInvoice({ ...DOC_INVOICE, id: undefined })).toThrow(/no id/)
    expect(() => transformInvoice({ ...DOC_INVOICE, amount: undefined })).toThrow(/no amount/)
  })
})
