import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type JalebiOrder } from '../../../../../../../src/verticals/accounting/adapters/jalebi/transform/invoice'

function makeRaw(overrides: Partial<JalebiOrder> = {}): JalebiOrder {
  return {
    id: 'ORDER-001',
    order_number: 'JAL-2024-001',
    created_at: '2024-03-01',
    due_date: '2024-03-31',
    subtotal: 800,
    tax_total: 40,
    grand_total: 840,
    amount_due: 840,
    status: 'confirmed',
    customer_id: 'CUST-001',
    currency: 'EGP',
    items: [],
    ...overrides,
  }
}

describe('transformInvoice (jalebi)', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeRaw())
    expect(result.id).toBe('ORDER-001')
    expect(result.totalAmount).toBe(840)
    expect(result.taxAmount).toBe(40)
    expect(result.currency).toBe('EGP')
    expect(result.type).toBe('INVOICE')
  })

  it('maps invoiceNumber from order_number', () => {
    const result = transformInvoice(makeRaw())
    expect(result.invoiceNumber).toBe('JAL-2024-001')
  })

  it('maps contactId from customer_id', () => {
    const result = transformInvoice(makeRaw())
    expect(result.contactId).toBe('CUST-001')
  })

  it('maps balanceAmount from amount_due', () => {
    const result = transformInvoice(makeRaw({ amount_due: 420 }))
    expect(result.balanceAmount).toBe(420)
  })

  it('parses dates as Date objects', () => {
    const result = transformInvoice(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
    expect(result.dueAt).toEqual(new Date('2024-03-31'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformInvoice(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps pending status to DRAFT', () => {
    expect(transformInvoice(makeRaw({ status: 'pending' })).status).toBe('DRAFT')
  })

  it('maps confirmed status to AUTHORIZED', () => {
    expect(transformInvoice(makeRaw({ status: 'confirmed' })).status).toBe('AUTHORIZED')
  })

  it('maps paid status correctly', () => {
    expect(transformInvoice(makeRaw({ status: 'paid' })).status).toBe('PAID')
  })

  it('maps cancelled status to VOIDED', () => {
    expect(transformInvoice(makeRaw({ status: 'cancelled' })).status).toBe('VOIDED')
  })

  it('defaults unknown status to DRAFT', () => {
    expect(transformInvoice(makeRaw({ status: 'unknown' })).status).toBe('DRAFT')
  })

  it('maps line items correctly', () => {
    const raw = makeRaw({
      items: [
        {
          id: 'LI-1',
          name: 'Shawarma Plate',
          description: 'Large chicken shawarma',
          quantity: 2,
          unit_price: 45,
          total: 90,
          tax_amount: 4.5,
        },
      ],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].id).toBe('LI-1')
    expect(result.lineItems![0].itemName).toBe('Shawarma Plate')
    expect(result.lineItems![0].unitQuantity).toBe(2)
    expect(result.lineItems![0].totalAmount).toBe(90)
  })

  it('returns empty lineItems when items is empty', () => {
    const result = transformInvoice(makeRaw({ items: [] }))
    expect(result.lineItems).toEqual([])
  })

  it('handles missing date fields', () => {
    const result = transformInvoice(makeRaw({ created_at: '', due_date: '' }))
    expect(result.postedAt).toBeUndefined()
    expect(result.dueAt).toBeUndefined()
  })

  it('handles numeric id correctly', () => {
    const result = transformInvoice(makeRaw({ id: 999 }))
    expect(result.id).toBe('999')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeRaw())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
