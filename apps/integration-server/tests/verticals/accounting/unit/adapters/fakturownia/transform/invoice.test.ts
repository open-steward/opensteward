import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  untransformInvoice,
  type FakturowniaInvoice,
} from '../../../../../../../src/verticals/accounting/adapters/fakturownia/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'

function makeRaw(overrides: Partial<FakturowniaInvoice> = {}): FakturowniaInvoice {
  return {
    id: 4001,
    number: 'FV/2024/001',
    kind: 'vat',
    status: 'issued',
    issue_date: '2024-07-01',
    payment_to: '2024-08-01',
    currency: 'PLN',
    price_gross: 246.0,
    price_tax: 46.0,
    price_net: 200.0,
    paid: 0,
    client_id: 15,
    description: 'Monthly service fee',
    positions: [],
    ...overrides,
  }
}

describe('fakturownia transformInvoice', () => {
  it('maps id to string', () => {
    const result = transformInvoice(makeRaw({ id: 1234 }))
    expect(result.id).toBe('1234')
  })

  it('type is always INVOICE', () => {
    const result = transformInvoice(makeRaw())
    expect(result.type).toBe('INVOICE')
  })

  it('maps number to invoiceNumber', () => {
    const result = transformInvoice(makeRaw({ number: 'FV/001' }))
    expect(result.invoiceNumber).toBe('FV/001')
  })

  it('maps client_id to contactId as string', () => {
    const result = transformInvoice(makeRaw({ client_id: 15 }))
    expect(result.contactId).toBe('15')
  })

  it('major-unit price_gross → minor units', () => {
    const result = transformInvoice(makeRaw({ price_gross: 12.34 }))
    expect(result.totalAmount).toBe(1234)
  })

  it('major-unit price_tax → minor units', () => {
    const result = transformInvoice(makeRaw({ price_tax: 2.3 }))
    expect(result.taxAmount).toBe(230)
  })

  it('balanceAmount = total - paid in minor units', () => {
    const result = transformInvoice(makeRaw({ price_gross: 100, paid: 40 }))
    expect(result.balanceAmount).toBe(6000)
  })

  it('status paid → PAID', () => {
    const result = transformInvoice(makeRaw({ status: 'paid' }))
    expect(result.status).toBe('PAID')
  })

  it('status partial → PARTIALLY_PAID', () => {
    const result = transformInvoice(makeRaw({ status: 'partial' }))
    expect(result.status).toBe('PARTIALLY_PAID')
  })

  it('status rejected → VOIDED', () => {
    const result = transformInvoice(makeRaw({ status: 'rejected' }))
    expect(result.status).toBe('VOIDED')
  })

  it('status sent → AUTHORIZED', () => {
    const result = transformInvoice(makeRaw({ status: 'sent' }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps position discount to discountAmount in minor units', () => {
    const result = transformInvoice(
      makeRaw({
        positions: [
          {
            id: 1,
            name: 'Widget',
            quantity: 1,
            price_net: 100,
            total_price_gross: 123,
            total_price_net: 100,
            discount: 5.0,
          },
        ],
      }),
    )
    expect(result.lineItems?.[0]?.discountAmount).toBe(500)
  })

  it('taxAmount on lineitem = totalGross - totalNet', () => {
    const result = transformInvoice(
      makeRaw({
        positions: [
          {
            id: 2,
            name: 'Service',
            quantity: 1,
            price_net: 100,
            total_price_gross: 123,
            total_price_net: 100,
          },
        ],
      }),
    )
    expect(result.lineItems?.[0]?.taxAmount).toBe(2300)
  })

  it('metadata is the raw object', () => {
    const raw = makeRaw()
    const result = transformInvoice(raw)
    expect(result.metadata).toBe(raw)
  })

  it('passes InvoiceSchema.parse without throwing', () => {
    const result = transformInvoice(makeRaw())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})

describe('fakturownia untransformInvoice', () => {
  it('sets kind to vat', () => {
    const result = untransformInvoice({})
    expect(result.kind).toBe('vat')
  })

  it('maps contactId to client_id', () => {
    const result = untransformInvoice({ contactId: '42' })
    expect(result.client_id).toBe('42')
  })

  it('formats postedAt to issue_date string', () => {
    const result = untransformInvoice({ postedAt: new Date('2024-09-15T00:00:00.000Z') })
    expect(result.issue_date).toBe('2024-09-15')
  })
})
