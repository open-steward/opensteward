import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  untransformInvoice,
  type InfaktInvoice,
} from '../../../../../../../src/verticals/accounting/adapters/infakt/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'

function makeInvoice(overrides: Partial<InfaktInvoice> = {}): InfaktInvoice {
  return {
    uuid: 'inv-uuid-xyz',
    number: 'FV/12/2024',
    kind: 'vat',
    status: 'sent',
    currency: 'PLN',
    invoice_date: '2024-12-15',
    sale_date: '2024-12-15',
    payment_date: '2024-12-30',
    paid_date: null,
    net_price: 40650, // already in groszy
    tax_price: 9350,
    gross_price: 50000,
    left_to_pay: 50000,
    client_id: 42,
    client_company_name: 'Acme Sp. z o.o.',
    client_tax_code: '888-777-66-55',
    notes: 'December consulting',
    payment_method: 'transfer',
    services: [
      {
        name: 'Consulting Dec',
        tax_symbol: '23',
        unit: 'godz.',
        quantity: 5,
        unit_net_price: 8130,
        net_price: 40650,
        gross_price: 50000,
        tax_price: 9350,
        discount: null,
        pkwiu: null,
      },
    ],
    created_at: '2024-12-15T08:00:00.000Z',
    ...overrides,
  }
}

describe('transformInvoice (infakt)', () => {
  it('maps uuid to id', () => {
    expect(transformInvoice(makeInvoice()).id).toBe('inv-uuid-xyz')
  })

  it('sets type to INVOICE', () => {
    expect(transformInvoice(makeInvoice()).type).toBe('INVOICE')
  })

  it('maps number to invoiceNumber', () => {
    expect(transformInvoice(makeInvoice()).invoiceNumber).toBe('FV/12/2024')
  })

  it('maps client_id to contactId as string', () => {
    expect(transformInvoice(makeInvoice()).contactId).toBe('42')
  })

  it('omits contactId when client_id is null', () => {
    expect(transformInvoice(makeInvoice({ client_id: null })).contactId).toBeUndefined()
  })

  it('maps currency', () => {
    expect(transformInvoice(makeInvoice()).currency).toBe('PLN')
  })

  it('passes gross_price directly as totalAmount (amounts are already groszy)', () => {
    expect(transformInvoice(makeInvoice({ gross_price: 50000 })).totalAmount).toBe(50000)
  })

  it('passes tax_price directly as taxAmount', () => {
    expect(transformInvoice(makeInvoice()).taxAmount).toBe(9350)
  })

  it('passes left_to_pay directly as balanceAmount', () => {
    expect(transformInvoice(makeInvoice({ left_to_pay: 50000 })).balanceAmount).toBe(50000)
  })

  it('computes paidAmount as gross_price - left_to_pay', () => {
    const result = transformInvoice(makeInvoice({ gross_price: 50000, left_to_pay: 20000 }))
    expect(result.paidAmount).toBe(30000)
  })

  it('maps sent status to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ status: 'sent' })).status).toBe('AUTHORIZED')
  })

  it('maps paid status to PAID', () => {
    expect(transformInvoice(makeInvoice({ status: 'paid' })).status).toBe('PAID')
  })

  it('maps draft status to DRAFT', () => {
    expect(transformInvoice(makeInvoice({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps unknown status to DRAFT (default)', () => {
    expect(transformInvoice(makeInvoice({ status: 'weird_state' })).status).toBe('DRAFT')
  })

  it('maps invoice_date to postedAt via toIsoDatetime', () => {
    expect(transformInvoice(makeInvoice()).postedAt).toEqual(new Date('2024-12-15T00:00:00.000Z'))
  })

  it('maps payment_date to dueAt', () => {
    expect(transformInvoice(makeInvoice()).dueAt).toEqual(new Date('2024-12-30T00:00:00.000Z'))
  })

  it('maps created_at to createdAt', () => {
    expect(transformInvoice(makeInvoice()).createdAt).toEqual(new Date('2024-12-15T08:00:00.000Z'))
  })

  it('maps paid_date to paidAt', () => {
    const result = transformInvoice(makeInvoice({ paid_date: '2024-12-31T00:00:00.000Z' }))
    expect(result.paidAt).toEqual(new Date('2024-12-31T00:00:00.000Z'))
  })

  it('maps services to lineItems', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.itemName).toBe('Consulting Dec')
    expect(li.unitQuantity).toBe(5)
    expect(li.totalAmount).toBe(50000)
    expect(li.taxAmount).toBe(9350)
  })

  it('maps notes', () => {
    expect(transformInvoice(makeInvoice()).notes).toBe('December consulting')
  })

  it('produces a schema-valid Invoice', () => {
    expect(() => InvoiceSchema.parse(transformInvoice(makeInvoice()))).not.toThrow()
  })

  describe('untransformInvoice', () => {
    it('hardcodes kind to vat', () => {
      expect(untransformInvoice({})['kind']).toBe('vat')
    })

    it('maps contactId to client_id as number', () => {
      expect(untransformInvoice({ contactId: '42' })['client_id']).toBe(42)
    })

    it('converts postedAt to YYYY-MM-DD date string', () => {
      const body = untransformInvoice({ postedAt: new Date('2024-12-15') })
      expect(body['invoice_date']).toBe('2024-12-15')
    })

    it('maps currency directly', () => {
      expect(untransformInvoice({ currency: 'PLN' })['currency']).toBe('PLN')
    })
  })
})
