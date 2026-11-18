import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type MaxioInvoice } from '../../../../../../../src/verticals/accounting/adapters/maxio/transform/invoice'

function makeInvoice(overrides: Partial<MaxioInvoice> = {}): MaxioInvoice {
  return {
    uid: 'inv_ABC123',
    number: 'INV-001',
    sequence_number: 1,
    state: 'open',
    created_at: '2024-03-01T00:00:00Z',
    due_date: '2024-03-31',
    paid_date: null,
    currency: 'USD',
    total_amount: '1200.00',
    tax_amount: '200.00',
    paid_amount: '0.00',
    due_amount: '1200.00',
    customer_id: 42,
    subscription_id: 100,
    line_items: [],
    ...overrides,
  }
}

describe('transformInvoice (Maxio)', () => {
  it('maps id from uid', () => {
    expect(transformInvoice(makeInvoice()).id).toBe('inv_ABC123')
  })

  it('maps invoiceNumber from number', () => {
    expect(transformInvoice(makeInvoice()).invoiceNumber).toBe('INV-001')
  })

  it('maps contacts from customer_id as string', () => {
    expect(transformInvoice(makeInvoice()).contactId).toBe('42')
  })

  it('maps totalAmount from total_amount string', () => {
    expect(transformInvoice(makeInvoice()).totalAmount).toBe(1200)
  })

  it('maps taxAmount from tax_amount string', () => {
    expect(transformInvoice(makeInvoice()).taxAmount).toBe(200)
  })

  it('maps currency', () => {
    expect(transformInvoice(makeInvoice()).currency).toBe('USD')
  })

  it('sets type to INVOICE', () => {
    expect(transformInvoice(makeInvoice()).type).toBe('INVOICE')
  })

  it('parses dates as Date objects', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-03-01T00:00:00Z'))
    expect(result.dueAt).toEqual(new Date('2024-03-31'))
  })

  it('passes raw object as metadata', () => {
    const raw = makeInvoice()
    expect(transformInvoice(raw).metadata).toBe(raw)
  })

  it('maps draft state to DRAFT', () => {
    expect(transformInvoice(makeInvoice({ state: 'draft' })).status).toBe('DRAFT')
  })

  it('maps open state to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ state: 'open' })).status).toBe('AUTHORIZED')
  })

  it('maps paid state to PAID', () => {
    expect(transformInvoice(makeInvoice({ state: 'paid' })).status).toBe('PAID')
  })

  it('maps voided state to VOIDED', () => {
    expect(transformInvoice(makeInvoice({ state: 'voided' })).status).toBe('VOIDED')
  })

  it('maps canceled state to VOIDED', () => {
    expect(transformInvoice(makeInvoice({ state: 'canceled' })).status).toBe('VOIDED')
  })

  it('maps line_items to lineItems', () => {
    const raw = makeInvoice({
      line_items: [
        {
          uid: 'li_1',
          title: 'Service A',
          description: 'Monthly service',
          quantity: '2',
          unit_price: '500.00',
          subtotal_amount: '1000.00',
          tax_amount: '100.00',
        },
      ],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('li_1')
    expect(li.itemDescription).toBe('Service A')
    expect(li.unitAmount).toBe(500)
    expect(li.unitQuantity).toBe(2)
    expect(li.totalAmount).toBe(1000)
    expect(li.taxAmount).toBe(100)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
