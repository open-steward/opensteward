import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type MekariJurnalInvoice } from '../../../../../../../src/verticals/accounting/adapters/mekarijurnal/transform/invoice'

function makeInvoice(overrides: Partial<MekariJurnalInvoice> = {}): MekariJurnalInvoice {
  return {
    id: 101,
    transaction_no: 'INV-001',
    status: 'open',
    transaction_date: '2024-03-01',
    due_date: '2024-03-31',
    total: 5000000,
    tax_amount: 500000,
    currency_code: 'IDR',
    person_id: 42,
    lines: [],
    ...overrides,
  }
}

describe('transformInvoice (mekarijurnal)', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.id).toBe('101')
    expect(result.invoiceNumber).toBe('INV-001')
    expect(result.contactId).toBe('42')
    expect(result.totalAmount).toBe(5000000)
    expect(result.taxAmount).toBe(500000)
    expect(result.currency).toBe('IDR')
    expect(result.type).toBe('INVOICE')
  })

  it('parses dates as Date objects', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
    expect(result.dueAt).toEqual(new Date('2024-03-31'))
  })

  it('passes raw object through as metadata unchanged (reference equality)', () => {
    const raw = makeInvoice({ transaction_no: 'INV-REF' })
    const result = transformInvoice(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps open status to AUTHORIZED', () => {
    const result = transformInvoice(makeInvoice({ status: 'open' }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps paid status to PAID', () => {
    const result = transformInvoice(makeInvoice({ status: 'paid' }))
    expect(result.status).toBe('PAID')
  })

  it('maps partially_paid status to PARTIALLY_PAID', () => {
    const result = transformInvoice(makeInvoice({ status: 'partially_paid' }))
    expect(result.status).toBe('PARTIALLY_PAID')
  })

  it('maps voided status to VOIDED', () => {
    const result = transformInvoice(makeInvoice({ status: 'voided' }))
    expect(result.status).toBe('VOIDED')
  })

  it('maps draft/unknown status to DRAFT', () => {
    const result = transformInvoice(makeInvoice({ status: 'draft' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps invoice lines to lineItems', () => {
    const raw = makeInvoice({
      lines: [
        {
          id: 1,
          product_name: 'Widget',
          description: 'A widget',
          quantity: 2,
          unit_price: 100000,
          amount: 200000,
          tax_amount: 20000,
        },
      ],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('1')
    expect(li.itemDescription).toBe('Widget')
    expect(li.unitAmount).toBe(100000)
    expect(li.unitQuantity).toBe(2)
    expect(li.totalAmount).toBe(200000)
    expect(li.taxAmount).toBe(20000)
  })

  it('handles null person_id', () => {
    const result = transformInvoice(makeInvoice({ person_id: null as unknown as number }))
    expect(result.contactId).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
