import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  type InvoicedInvoice,
  type InvoicedLineItem,
} from '../../../../../../../src/verticals/accounting/adapters/invoiced/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'

function makeLineItem(overrides: Partial<InvoicedLineItem> = {}): InvoicedLineItem {
  return {
    id: 201,
    object: 'line_item',
    catalog_item: 'sub-annual',
    type: 'product',
    name: 'Annual Subscription',
    description: 'Full year platform access',
    quantity: 1,
    unit_cost: 12000,
    amount: 12000,
    taxable: true,
    discountable: false,
    metadata: {},
    ...overrides,
  }
}

function makeInvoice(overrides: Partial<InvoicedInvoice> = {}): InvoicedInvoice {
  return {
    id: 1042,
    object: 'invoice',
    customer: 99,
    number: 'INV-1042',
    status: 'sent',
    draft: false,
    closed: false,
    paid: false,
    currency: 'usd',
    date: 1700000000,
    due_date: 1702678400,
    payment_terms: 'Net 30',
    items: [makeLineItem()],
    subtotal: 12000,
    discounts: [],
    taxes: [],
    total: 12000,
    balance: 12000,
    url: 'https://app.example.com/invoices/INV-1042',
    payment_url: null,
    pdf_url: null,
    notes: 'Thank you for your business.',
    metadata: {},
    created_at: 1700000000,
    updated_at: 1700100000,
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('converts numeric id to string', () => {
    expect(transformInvoice(makeInvoice({ id: 1042 })).id).toBe('1042')
  })

  it('always sets type to INVOICE', () => {
    expect(transformInvoice(makeInvoice()).type).toBe('INVOICE')
  })

  it('uses number as invoiceNumber when present', () => {
    expect(transformInvoice(makeInvoice({ number: 'INV-1042' })).invoiceNumber).toBe('INV-1042')
  })

  it('falls back to String(id) for invoiceNumber when number is null', () => {
    const result = transformInvoice(makeInvoice({ id: 1042, number: null }))
    expect(result.invoiceNumber).toBe('1042')
  })

  it('converts customer number to contactId string', () => {
    expect(transformInvoice(makeInvoice({ customer: 99 })).contactId).toBe('99')
  })

  it('uppercases currency', () => {
    expect(transformInvoice(makeInvoice({ currency: 'usd' })).currency).toBe('USD')
  })

  it('maps total to totalAmount', () => {
    expect(transformInvoice(makeInvoice({ total: 12000 })).totalAmount).toBe(12000)
  })

  it('maps balance to balanceAmount', () => {
    expect(transformInvoice(makeInvoice({ balance: 6000 })).balanceAmount).toBe(6000)
  })

  it('maps url', () => {
    const url = 'https://app.example.com/invoices/INV-1042'
    expect(transformInvoice(makeInvoice({ url })).url).toBe(url)
  })

  it('maps notes', () => {
    expect(transformInvoice(makeInvoice({ notes: 'Thank you.' })).notes).toBe('Thank you.')
  })

  it('converts epoch date to postedAt', () => {
    const result = transformInvoice(makeInvoice({ date: 1700000000 }))
    expect(result.postedAt).toEqual(new Date(1700000000 * 1000))
  })

  it('converts epoch due_date to dueAt', () => {
    const result = transformInvoice(makeInvoice({ due_date: 1702678400 }))
    expect(result.dueAt).toEqual(new Date(1702678400 * 1000))
  })

  it('sets postedAt to undefined when date is null', () => {
    expect(transformInvoice(makeInvoice({ date: null })).postedAt).toBeUndefined()
  })

  it('sets dueAt to undefined when due_date is null', () => {
    expect(transformInvoice(makeInvoice({ due_date: null })).dueAt).toBeUndefined()
  })

  it('converts epoch seconds to Date for createdAt and updatedAt', () => {
    const result = transformInvoice(makeInvoice({ created_at: 1700000000, updated_at: 1700100000 }))
    expect(result.createdAt).toEqual(new Date(1700000000 * 1000))
    expect(result.updatedAt).toEqual(new Date(1700100000 * 1000))
  })

  describe('status mapping', () => {
    it('maps voided → VOIDED', () => {
      expect(transformInvoice(makeInvoice({ status: 'voided' })).status).toBe('VOIDED')
    })

    it('maps paid → PAID', () => {
      expect(transformInvoice(makeInvoice({ status: 'paid' })).status).toBe('PAID')
    })

    it('maps past_due → OVERDUE', () => {
      expect(transformInvoice(makeInvoice({ status: 'past_due' })).status).toBe('OVERDUE')
    })

    it('maps pending → PARTIALLY_PAID', () => {
      expect(transformInvoice(makeInvoice({ status: 'pending' })).status).toBe('PARTIALLY_PAID')
    })

    it('maps draft → DRAFT', () => {
      expect(transformInvoice(makeInvoice({ status: 'draft' })).status).toBe('DRAFT')
    })

    it('maps sent → AUTHORIZED', () => {
      expect(transformInvoice(makeInvoice({ status: 'sent' })).status).toBe('AUTHORIZED')
    })

    it('maps viewed → AUTHORIZED', () => {
      expect(transformInvoice(makeInvoice({ status: 'viewed' })).status).toBe('AUTHORIZED')
    })

    it('maps not_sent → AUTHORIZED', () => {
      expect(transformInvoice(makeInvoice({ status: 'not_sent' })).status).toBe('AUTHORIZED')
    })
  })

  describe('line items', () => {
    it('maps line item fields', () => {
      const result = transformInvoice(makeInvoice())
      const li = result.lineItems?.[0]
      expect(li?.id).toBe('201')
      expect(li?.itemName).toBe('Annual Subscription')
      expect(li?.itemDescription).toBe('Full year platform access')
      expect(li?.unitAmount).toBe(12000)
      expect(li?.unitQuantity).toBe(1)
      expect(li?.totalAmount).toBe(12000)
    })

    it('maps catalog_item to itemId', () => {
      expect(transformInvoice(makeInvoice()).lineItems?.[0]?.itemId).toBe('sub-annual')
    })

    it('omits itemId when catalog_item is null', () => {
      const result = transformInvoice(
        makeInvoice({ items: [makeLineItem({ catalog_item: null })] }),
      )
      expect(result.lineItems?.[0]?.itemId).toBeUndefined()
    })

    it('produces empty lineItems array when items is empty', () => {
      const result = transformInvoice(makeInvoice({ items: [] }))
      expect(result.lineItems).toEqual([])
    })
  })

  it('passes raw object as metadata', () => {
    const raw = makeInvoice()
    expect(transformInvoice(raw).metadata).toBe(raw)
  })

  it('passes InvoiceSchema validation', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
