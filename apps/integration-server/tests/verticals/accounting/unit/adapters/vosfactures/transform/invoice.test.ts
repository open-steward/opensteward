import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  untransformInvoice,
  type VosFacturesInvoice,
} from '../../../../../../../src/verticals/accounting/adapters/vosfactures/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'

function makeInvoice(overrides: Partial<VosFacturesInvoice> = {}): VosFacturesInvoice {
  return {
    id: 1001,
    number: 'FV/2024/001',
    kind: 'vat',
    status: 'issued',
    income: '1',
    issue_date: '2024-02-10',
    payment_to: '2024-03-10',
    currency: 'PLN',
    price_gross: '1230.00',
    price_net: '1000.00',
    price_tax: '230.00',
    paid: '0',
    client_id: 50,
    description: 'Monthly services',
    payment_type: 'transfer',
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.id).toBe('1001')
    expect(result.invoiceNumber).toBe('FV/2024/001')
    expect(result.contactId).toBe('50')
    expect(result.currency).toBe('PLN')
    expect(result.notes).toBe('Monthly services')
  })

  describe('amounts (minor units of the document currency)', () => {
    it('reads price_gross, price_tax and paid in minor units, balance = total - paid', () => {
      const result = InvoiceSchema.parse(
        transformInvoice(
          makeInvoice({ price_gross: '1230.45', price_tax: '230.09', paid: '200.40' }),
        ),
      )
      expect(result.totalAmount).toBe(123045)
      expect(result.taxAmount).toBe(23009)
      expect(result.paidAmount).toBe(20040)
      expect(result.balanceAmount).toBe(103005)
    })

    it('reads the decimal comma the README writes ("paid" : "0,00", "72,57")', () => {
      const result = InvoiceSchema.parse(
        transformInvoice(makeInvoice({ price_gross: '72,57', price_tax: '13,57', paid: '0,00' })),
      )
      expect(result.totalAmount).toBe(7257)
      expect(result.taxAmount).toBe(1357)
      expect(result.paidAmount).toBe(0)
      expect(result.balanceAmount).toBe(7257)
    })

    it('scales by the currency exponent (JPY 0, KWD 3)', () => {
      const jpy = InvoiceSchema.parse(
        transformInvoice(makeInvoice({ currency: 'JPY', price_gross: '1000', paid: '0' })),
      )
      expect(jpy.totalAmount).toBe(1000)
      const kwd = InvoiceSchema.parse(
        transformInvoice(makeInvoice({ currency: 'KWD', price_gross: '1.500', paid: '0' })),
      )
      expect(kwd.totalAmount).toBe(1500)
    })

    it('does not read the undocumented tax, price_paid or remaining_price', () => {
      const result = InvoiceSchema.parse(
        transformInvoice(
          makeInvoice({
            price_tax: undefined,
            paid: undefined,
            tax: '230.00',
            price_paid: '5.00',
            remaining_price: '1.00',
          }),
        ),
      )
      expect(result.taxAmount).toBeUndefined()
      expect(result.paidAmount).toBeUndefined()
      expect(result.balanceAmount).toBeUndefined()
    })

    it('leaves out a value that is not a plain decimal rather than truncating it', () => {
      const result = InvoiceSchema.parse(
        transformInvoice(makeInvoice({ price_gross: '1 230,45', price_tax: 'disabled' })),
      )
      expect(result.totalAmount).toBeUndefined()
      expect(result.taxAmount).toBeUndefined()
    })
  })

  it('maps status issued to DRAFT', () => {
    const result = transformInvoice(makeInvoice({ status: 'issued' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps status paid to PAID', () => {
    const result = transformInvoice(makeInvoice({ status: 'paid' }))
    expect(result.status).toBe('PAID')
  })

  it('maps status partial to PARTIALLY_PAID', () => {
    const result = transformInvoice(makeInvoice({ status: 'partial' }))
    expect(result.status).toBe('PARTIALLY_PAID')
  })

  it('maps status sent to AUTHORIZED', () => {
    const result = transformInvoice(makeInvoice({ status: 'sent' }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps status rejected to VOIDED', () => {
    const result = transformInvoice(makeInvoice({ status: 'rejected' }))
    expect(result.status).toBe('VOIDED')
  })

  it('maps type from kind=correction to CREDITMEMO', () => {
    const result = transformInvoice(makeInvoice({ kind: 'correction' }))
    expect(result.type).toBe('CREDITMEMO')
  })

  it('maps income=0 to type BILL', () => {
    const result = transformInvoice(makeInvoice({ kind: 'vat', income: '0' }))
    expect(result.type).toBe('BILL')
  })

  it('maps income=1 to type INVOICE', () => {
    const result = transformInvoice(makeInvoice({ income: '1' }))
    expect(result.type).toBe('INVOICE')
  })

  it('parses dates as Date objects', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-02-10'))
    expect(result.dueAt).toEqual(new Date('2024-03-10'))
  })

  it('maps lineItems with tax computed from gross-net diff', () => {
    const raw = makeInvoice({
      positions: [
        {
          id: 5,
          product_id: 100,
          name: 'Consulting',
          price_net: '100.00',
          quantity: '2',
          total_price_gross: '246.00',
          total_price_net: '200.00',
        },
      ],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('5')
    expect(li.itemId).toBe('100')
    expect(li.unitAmount).toBe(10000)
    expect(li.unitQuantity).toBe(2)
    expect(li.taxAmount).toBe(4600)
    expect(li.totalAmount).toBe(24600)
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
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
    const canonical = transformInvoice(makeInvoice({ client_id: 99, currency: 'EUR' }))
    const body = untransformInvoice(canonical)
    expect(body['client_id']).toBe(99)
    expect(body['currency']).toBe('EUR')
    expect(body['income']).toBe('1')
  })
})

describe('untransformInvoice money', () => {
  it('sends price_net as the major-unit decimal of the canonical minor units', () => {
    const body = untransformInvoice({
      currency: 'EUR',
      lineItems: [{ itemName: 'A', unitQuantity: 2, unitAmount: 5900 }],
    })
    expect((body['positions'] as Array<Record<string, unknown>>)[0]['price_net']).toBe(59)
  })

  it('converts by the invoice currency (JPY has no minor unit)', () => {
    const body = untransformInvoice({
      currency: 'JPY',
      lineItems: [{ itemName: 'A', unitQuantity: 1, unitAmount: 1000 }],
    })
    expect((body['positions'] as Array<Record<string, unknown>>)[0]['price_net']).toBe(1000)
  })

  it('round-trips a line amount through transform and untransform', () => {
    const canonical = InvoiceSchema.parse(
      transformInvoice(
        makeInvoice({
          currency: 'EUR',
          positions: [{ name: 'A', quantity: 1, price_net: '72,57', total_price_gross: '72,57' }],
        }),
      ),
    )
    const body = untransformInvoice(canonical)
    expect((body['positions'] as Array<Record<string, unknown>>)[0]['price_net']).toBe(72.57)
  })
})
