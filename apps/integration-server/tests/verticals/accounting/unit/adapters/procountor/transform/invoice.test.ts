import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import {
  transformInvoice,
  type ProcountorInvoice,
} from '../../../../../../../src/verticals/accounting/adapters/procountor/transform/invoice'

function makeInvoice(overrides: Partial<ProcountorInvoice> = {}): ProcountorInvoice {
  return {
    id: 1001,
    invoiceNumber: 5001,
    partnerId: 200,
    currency: 'EUR',
    date: '2024-03-15',
    dueDate: '2024-04-15',
    sum: 12400,
    vatAmount: 2400,
    openSum: 12400,
    paidSum: 0,
    status: 'SENT',
    invoiceRows: [],
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps id as string', () => {
    expect(transformInvoice(makeInvoice()).id).toBe('1001')
  })

  it('maps invoiceNumber as string', () => {
    expect(transformInvoice(makeInvoice()).invoiceNumber).toBe('5001')
  })

  it('maps partnerId to contactId as string', () => {
    expect(transformInvoice(makeInvoice()).contactId).toBe('200')
  })

  it('maps core amount fields', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.totalAmount).toBe(12400)
    expect(result.taxAmount).toBe(2400)
    expect(result.balanceAmount).toBe(12400)
    expect(result.currency).toBe('EUR')
  })

  it('sets type to INVOICE', () => {
    expect(transformInvoice(makeInvoice()).type).toBe('INVOICE')
  })

  it('parses date fields as Date objects', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-03-15'))
    expect(result.dueAt).toEqual(new Date('2024-04-15'))
  })

  it('returns undefined postedAt when date is empty', () => {
    expect(transformInvoice(makeInvoice({ date: '' })).postedAt).toBeUndefined()
  })

  it('maps EMPTY status to DRAFT', () => {
    expect(transformInvoice(makeInvoice({ status: 'EMPTY' })).status).toBe('DRAFT')
  })

  it('maps UNFINISHED status to DRAFT', () => {
    expect(transformInvoice(makeInvoice({ status: 'UNFINISHED' })).status).toBe('DRAFT')
  })

  it('maps SENT status to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ status: 'SENT' })).status).toBe('AUTHORIZED')
  })

  it('maps APPROVED status to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ status: 'APPROVED' })).status).toBe('AUTHORIZED')
  })

  it('maps NOTAPPROVED status to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ status: 'NOTAPPROVED' })).status).toBe('AUTHORIZED')
  })

  it('maps PAID status to PAID', () => {
    expect(transformInvoice(makeInvoice({ status: 'PAID' })).status).toBe('PAID')
  })

  it('maps PARTLYPAID status to PARTIALLY_PAID', () => {
    expect(transformInvoice(makeInvoice({ status: 'PARTLYPAID' })).status).toBe('PARTIALLY_PAID')
  })

  it('maps CREDITED status to VOIDED', () => {
    expect(transformInvoice(makeInvoice({ status: 'CREDITED' })).status).toBe('VOIDED')
  })

  it('maps invoiceRows to lineItems', () => {
    const raw = makeInvoice({
      invoiceRows: [
        {
          id: 1,
          product: 'PROD-01',
          description: 'Consulting',
          quantity: 10,
          unitPrice: 100,
          sum: 1000,
          vatPercent: 24,
          accountNumber: '3000',
        },
      ],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('1')
    expect(li.itemId).toBe('PROD-01')
    expect(li.itemDescription).toBe('Consulting')
    expect(li.unitAmount).toBe(100)
    expect(li.unitQuantity).toBe(10)
    expect(li.totalAmount).toBe(1000)
  })

  it('returns undefined contactId when partnerId is 0', () => {
    expect(transformInvoice(makeInvoice({ partnerId: 0 })).contactId).toBeUndefined()
  })

  it('returns undefined paidAmount when paidSum is 0', () => {
    expect(transformInvoice(makeInvoice({ paidSum: 0 })).paidAmount).toBeUndefined()
  })

  it('passes raw object as metadata unchanged', () => {
    const raw = makeInvoice({ status: 'PAID' })
    const result = transformInvoice(raw)
    expect(result.metadata).toBe(raw)
    expect((result.metadata as Record<string, unknown>)['status']).toBe('PAID')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
