import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type FatouaInvoice } from '../../../../../../../src/verticals/accounting/adapters/fatoura/transform/invoice'

function makeRaw(overrides: Partial<FatouaInvoice> = {}): FatouaInvoice {
  return {
    id: '77',
    invoice_no: 'FT-2024-077',
    issue_date: '2024-05-01',
    due_date: '2024-05-31',
    amount_excl_tax: 5000,
    tax_amount: 250,
    total_amount: 5250,
    paid_amount: 0,
    status: 'pending',
    client_id: 'cl1',
    currency: 'SAR',
    items: [],
    ...overrides,
  }
}

describe('transformInvoice (fatoura)', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeRaw())
    expect(result.id).toBe('77')
    expect(result.invoiceNumber).toBe('FT-2024-077')
    expect(result.totalAmount).toBe(5250)
    expect(result.taxAmount).toBe(250)
    expect(result.currency).toBe('SAR')
    expect(result.type).toBe('INVOICE')
    expect(result.contactId).toBe('cl1')
    expect(result.paidAmount).toBe(0)
  })

  it('parses dates as Date objects', () => {
    const result = transformInvoice(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-05-01'))
    expect(result.dueAt).toEqual(new Date('2024-05-31'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformInvoice(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps pending status to DRAFT', () => {
    expect(transformInvoice(makeRaw({ status: 'pending' })).status).toBe('DRAFT')
  })

  it('maps active status to AUTHORIZED', () => {
    expect(transformInvoice(makeRaw({ status: 'active' })).status).toBe('AUTHORIZED')
  })

  it('maps settled status to PAID', () => {
    expect(transformInvoice(makeRaw({ status: 'settled' })).status).toBe('PAID')
  })

  it('maps voided status to VOIDED', () => {
    expect(transformInvoice(makeRaw({ status: 'voided' })).status).toBe('VOIDED')
  })

  it('defaults unknown status to DRAFT', () => {
    expect(transformInvoice(makeRaw({ status: 'archived' })).status).toBe('DRAFT')
  })

  it('maps items correctly', () => {
    const raw = makeRaw({
      items: [
        {
          id: 'it1',
          description: 'Design Work',
          qty: 10,
          unit_price: 500,
          total: 5000,
          tax_rate: 5,
          tax_amount: 250,
        },
      ],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].id).toBe('it1')
    expect(result.lineItems![0].itemDescription).toBe('Design Work')
    expect(result.lineItems![0].unitQuantity).toBe(10)
    expect(result.lineItems![0].unitAmount).toBe(500)
    expect(result.lineItems![0].totalAmount).toBe(5000)
    expect(result.lineItems![0].taxAmount).toBe(250)
  })

  it('handles missing optional fields gracefully', () => {
    const result = transformInvoice({ id: '0' })
    expect(result.id).toBe('0')
    expect(result.invoiceNumber).toBeUndefined()
    expect(result.postedAt).toBeUndefined()
    expect(result.dueAt).toBeUndefined()
    expect(result.lineItems).toEqual([])
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeRaw())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
