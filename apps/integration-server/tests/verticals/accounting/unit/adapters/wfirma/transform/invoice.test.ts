import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  untransformInvoice,
  type WfirmaInvoice,
} from '../../../../../../../src/verticals/accounting/adapters/wfirma/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'

function makeInvoice(overrides: Partial<WfirmaInvoice> = {}): WfirmaInvoice {
  return {
    id: 500,
    fullnumber: 'FV 1/2024',
    number: 1,
    date: '2024-04-01',
    paymentdate: '2024-05-01',
    paymentstate: 'unpaid',
    paymentmethod: 'transfer',
    type: 'normal',
    netto: '1000.00',
    brutto: '1230.00',
    tax: '230.00',
    paid: '0.00',
    remaining: '1230.00',
    currency: 'PLN',
    notes: 'Thank you',
    contractor_id: 99,
    created: '2024-03-31T00:00:00.000Z',
    modified: '2024-04-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.id).toBe('500')
    expect(result.type).toBe('INVOICE')
    expect(result.invoiceNumber).toBe('FV 1/2024')
    expect(result.contactId).toBe('99')
    expect(result.currency).toBe('PLN')
    expect(result.notes).toBe('Thank you')
  })

  it('converts brutto to totalAmount in minor units (grosz)', () => {
    const result = transformInvoice(makeInvoice({ brutto: '1230.00' }))
    expect(result.totalAmount).toBe(123000)
  })

  it('converts tax to taxAmount in minor units', () => {
    const result = transformInvoice(makeInvoice({ tax: '230.00' }))
    expect(result.taxAmount).toBe(23000)
  })

  it('maps paymentstate unpaid to AUTHORIZED', () => {
    const result = transformInvoice(makeInvoice({ paymentstate: 'unpaid' }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps paymentstate paid to PAID', () => {
    const result = transformInvoice(makeInvoice({ paymentstate: 'paid' }))
    expect(result.status).toBe('PAID')
  })

  it('defaults to DRAFT for undefined paymentstate', () => {
    const result = transformInvoice(makeInvoice({ paymentstate: 'undefined' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps type=correction to CREDITMEMO canonical type', () => {
    const result = transformInvoice(makeInvoice({ type: 'correction' }))
    expect(result.type).toBe('CREDITMEMO')
  })

  it('falls back to number when fullnumber absent', () => {
    const result = transformInvoice(makeInvoice({ fullnumber: undefined, number: 42 }))
    expect(result.invoiceNumber).toBe('42')
  })

  it('parses dates as Date objects', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toBeInstanceOf(Date)
    expect(result.dueAt).toBeInstanceOf(Date)
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('maps lineItems with brutto-based totalAmount in minor units', () => {
    const raw = makeInvoice({
      invoicecontents: [
        {
          id: 10,
          name: 'Service',
          count: '2',
          price: '500.00',
          netto: '1000.00',
          brutto: '1230.00',
          good_id: 7,
        },
      ],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('10')
    expect(li.itemId).toBe('7')
    expect(li.itemName).toBe('Service')
    expect(li.totalAmount).toBe(123000)
    expect(li.taxAmount).toBe(23000) // brutto - netto
    expect(li.unitQuantity).toBe(2)
  })

  it('passes raw as metadata', () => {
    const raw = makeInvoice()
    const result = transformInvoice(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a schema-valid result', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformInvoice', () => {
    const canonical = transformInvoice(
      makeInvoice({ currency: 'EUR', notes: 'Round-trip', contractor_id: 5 }),
    )
    const body = untransformInvoice(canonical)
    expect(body['currency']).toBe('EUR')
    expect(body['notes']).toBe('Round-trip')
    expect(body['contractor_id']).toBe(5)
  })
})
