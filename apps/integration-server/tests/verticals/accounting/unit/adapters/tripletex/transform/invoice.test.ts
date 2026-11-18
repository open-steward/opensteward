import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import {
  transformInvoice,
  type TripletexInvoice,
} from '../../../../../../../src/verticals/accounting/adapters/tripletex/transform/invoice'

function makeInvoice(overrides: Partial<TripletexInvoice> = {}): TripletexInvoice {
  return {
    id: 300,
    invoiceNumber: 2024001,
    invoiceDate: '2024-03-01',
    customer: { id: 200, name: 'Acme AS' },
    invoiceDueDate: '2024-03-31',
    amount: 11900,
    amountCurrency: 11900,
    amountExcludingVat: 10000,
    currency: { id: 'NOK', code: 'NOK' },
    isCreditNote: false,
    orderLines: [],
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps id as string', () => {
    expect(transformInvoice(makeInvoice()).id).toBe('300')
  })

  it('maps invoiceNumber as string', () => {
    expect(transformInvoice(makeInvoice()).invoiceNumber).toBe('2024001')
  })

  it('maps customer id to contactId', () => {
    expect(transformInvoice(makeInvoice()).contactId).toBe('200')
  })

  it('maps currency code correctly', () => {
    expect(transformInvoice(makeInvoice()).currency).toBe('NOK')
  })

  it('maps amountCurrency to totalAmount', () => {
    expect(transformInvoice(makeInvoice()).totalAmount).toBe(11900)
  })

  it('parses invoiceDate as Date object', () => {
    expect(transformInvoice(makeInvoice()).postedAt).toEqual(new Date('2024-03-01'))
  })

  it('parses invoiceDueDate as Date object', () => {
    expect(transformInvoice(makeInvoice()).dueAt).toEqual(new Date('2024-03-31'))
  })

  it('maps isCreditNote false to AUTHORIZED status', () => {
    expect(transformInvoice(makeInvoice({ isCreditNote: false })).status).toBe('AUTHORIZED')
  })

  it('maps isCreditNote true to VOIDED status', () => {
    expect(transformInvoice(makeInvoice({ isCreditNote: true })).status).toBe('VOIDED')
  })

  it('maps type to INVOICE', () => {
    expect(transformInvoice(makeInvoice()).type).toBe('INVOICE')
  })

  it('maps orderLines to lineItems', () => {
    const inv = transformInvoice(
      makeInvoice({
        orderLines: [
          {
            id: 1,
            description: 'Widget',
            count: 2,
            unitPriceExcludingVat: 500,
            amountExcludingVat: 1000,
            product: { id: 10, name: 'Widget' },
          },
        ],
      }),
    )
    expect(inv.lineItems).toHaveLength(1)
    expect(inv.lineItems![0].id).toBe('1')
    expect(inv.lineItems![0].itemDescription).toBe('Widget')
    expect(inv.lineItems![0].unitAmount).toBe(500)
    expect(inv.lineItems![0].unitQuantity).toBe(2)
    expect(inv.lineItems![0].totalAmount).toBe(1000)
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
