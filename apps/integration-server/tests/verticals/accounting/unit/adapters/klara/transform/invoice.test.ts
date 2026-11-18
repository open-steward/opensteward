import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  untransformInvoice,
  type KlaraInvoice,
} from '../../../../../../../src/verticals/accounting/adapters/klara/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'

function makeInvoice(overrides: Partial<KlaraInvoice> = {}): KlaraInvoice {
  return {
    id: 'inv-1',
    invoice_number: 'INV-2024-001',
    status: 'open',
    contact_id: 'cont-1',
    currency: 'CHF',
    total_amount: 10000,
    tax_amount: 800,
    discount_amount: 0,
    paid_amount: 0,
    balance_amount: 10000,
    invoice_date: '2024-03-01T00:00:00.000Z',
    due_date: '2030-04-01T00:00:00.000Z',
    notes: 'Test invoice',
    created_at: '2024-03-01T00:00:00.000Z',
    updated_at: '2024-03-05T00:00:00.000Z',
    positions: [],
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps core fields', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.id).toBe('inv-1')
    expect(result.type).toBe('INVOICE')
    expect(result.invoiceNumber).toBe('INV-2024-001')
    expect(result.contactId).toBe('cont-1')
    expect(result.currency).toBe('CHF')
    expect(result.totalAmount).toBe(10000)
    expect(result.taxAmount).toBe(800)
    expect(result.notes).toBe('Test invoice')
  })

  it('maps status draft to DRAFT', () => {
    expect(transformInvoice(makeInvoice({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps status open to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ status: 'open' })).status).toBe('AUTHORIZED')
  })

  it('maps status paid to PAID', () => {
    expect(transformInvoice(makeInvoice({ status: 'paid' })).status).toBe('PAID')
  })

  it('maps status voided to VOIDED', () => {
    expect(transformInvoice(makeInvoice({ status: 'voided' })).status).toBe('VOIDED')
  })

  it('parses dates as Date objects', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-03-01T00:00:00.000Z'))
    expect(result.dueAt).toEqual(new Date('2030-04-01T00:00:00.000Z'))
  })

  it('maps positions to lineItems', () => {
    const result = transformInvoice(
      makeInvoice({
        positions: [
          {
            id: 'pos-1',
            article_id: 'art-10',
            description: 'Consulting',
            quantity: 4,
            unit_price: 2500,
            total_price: 10000,
            account_id: 'acct-1',
          },
        ],
      }),
    )
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('pos-1')
    expect(li.itemId).toBe('art-10')
    expect(li.itemDescription).toBe('Consulting')
    expect(li.unitQuantity).toBe(4)
    expect(li.unitAmount).toBe(2500)
    expect(li.totalAmount).toBe(10000)
  })

  it('passes schema validation', () => {
    expect(() => InvoiceSchema.parse(transformInvoice(makeInvoice()))).not.toThrow()
  })

  it('round-trips through untransformInvoice', () => {
    const canonical = transformInvoice(makeInvoice())
    const wire = untransformInvoice(canonical)
    expect(wire.contact_id).toBe('cont-1')
    expect(wire.currency).toBe('CHF')
    expect(wire.invoice_number).toBe('INV-2024-001')
    expect(wire.notes).toBe('Test invoice')
  })
})
