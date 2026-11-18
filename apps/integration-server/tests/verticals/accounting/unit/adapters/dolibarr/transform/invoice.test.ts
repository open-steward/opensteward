import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type DolibarrInvoice } from '../../../../../../../src/verticals/accounting/adapters/dolibarr/transform/invoice'

function makeRaw(overrides: Partial<DolibarrInvoice> = {}): DolibarrInvoice {
  return {
    id: 42,
    ref: 'FA2024-0001',
    status: 1,
    date: 1705276800,
    date_echeance: 1707955200,
    total_ht: 1000,
    total_tva: 200,
    total_ttc: 1200,
    remaintopay: 1200,
    multicurrency_code: 'EUR',
    fk_soc: 7,
    lines: [],
    ...overrides,
  }
}

describe('transformInvoice (Dolibarr)', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeRaw())
    expect(result.id).toBe('42')
    expect(result.invoiceNumber).toBe('FA2024-0001')
    expect(result.contactId).toBe('7')
    expect(result.totalAmount).toBe(1200)
    expect(result.taxAmount).toBe(200)
    expect(result.balanceAmount).toBe(1200)
    expect(result.currency).toBe('EUR')
    expect(result.type).toBe('INVOICE')
  })

  it('maps status 0 to DRAFT', () => {
    const result = transformInvoice(makeRaw({ status: 0 }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps status 1 to AUTHORIZED', () => {
    const result = transformInvoice(makeRaw({ status: 1 }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps status 2 to PAID', () => {
    const result = transformInvoice(makeRaw({ status: 2 }))
    expect(result.status).toBe('PAID')
  })

  it('maps status 3 to VOIDED', () => {
    const result = transformInvoice(makeRaw({ status: 3 }))
    expect(result.status).toBe('VOIDED')
  })

  it('parses unix timestamps as Date objects', () => {
    const result = transformInvoice(makeRaw())
    expect(result.postedAt).toBeInstanceOf(Date)
    expect(result.dueAt).toBeInstanceOf(Date)
  })

  it('maps line items', () => {
    const result = transformInvoice(
      makeRaw({
        lines: [
          {
            id: 1,
            fk_product: 10,
            product_label: 'Widget',
            qty: 2,
            subprice: 500,
            total_ttc: 1200,
            total_tva: 200,
            tva_tx: 20,
            fk_account: 5,
          },
        ],
      }),
    )
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].itemDescription).toBe('Widget')
    expect(result.lineItems![0].totalAmount).toBe(1200)
  })

  it('sets metadata to raw object', () => {
    const raw = makeRaw()
    const result = transformInvoice(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeRaw())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
