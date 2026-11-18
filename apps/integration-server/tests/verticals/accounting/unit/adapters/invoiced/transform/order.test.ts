import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type InvoicedEstimate,
  type InvoicedEstimateLineItem,
} from '../../../../../../../src/verticals/accounting/adapters/invoiced/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'

function makeLineItem(overrides: Partial<InvoicedEstimateLineItem> = {}): InvoicedEstimateLineItem {
  return {
    id: 301,
    catalog_item: 'prod-001',
    name: 'Product One',
    description: 'A great product',
    quantity: 3,
    unit_cost: 2000,
    amount: 6000,
    ...overrides,
  }
}

function makeEstimate(overrides: Partial<InvoicedEstimate> = {}): InvoicedEstimate {
  return {
    id: 7001,
    object: 'estimate',
    customer: 55,
    number: 'EST-7001',
    status: 'sent',
    draft: false,
    closed: false,
    approved: false,
    currency: 'usd',
    date: 1700000000,
    expiration_date: 1702678400,
    items: [makeLineItem()],
    subtotal: 6000,
    total: 6000,
    notes: null,
    url: 'https://app.example.com/estimates/EST-7001',
    pdf_url: null,
    metadata: {},
    created_at: 1700000000,
    updated_at: 1700100000,
    ...overrides,
  }
}

describe('transformOrder', () => {
  it('converts numeric id to string', () => {
    expect(transformOrder(makeEstimate({ id: 7001 })).id).toBe('7001')
  })

  it('always sets type to SALES', () => {
    expect(transformOrder(makeEstimate()).type).toBe('SALES')
  })

  it('converts customer number to contactId string', () => {
    expect(transformOrder(makeEstimate({ customer: 55 })).contactId).toBe('55')
  })

  it('uppercases currency', () => {
    expect(transformOrder(makeEstimate({ currency: 'eur' })).currency).toBe('EUR')
  })

  it('maps total to totalAmount', () => {
    expect(transformOrder(makeEstimate({ total: 6000 })).totalAmount).toBe(6000)
  })

  it('converts epoch date to postedAt', () => {
    const result = transformOrder(makeEstimate({ date: 1700000000 }))
    expect(result.postedAt).toEqual(new Date(1700000000 * 1000))
  })

  it('sets postedAt to undefined when date is null', () => {
    expect(transformOrder(makeEstimate({ date: null })).postedAt).toBeUndefined()
  })

  it('converts epoch seconds to Date for createdAt and updatedAt', () => {
    const result = transformOrder(makeEstimate({ created_at: 1700000000, updated_at: 1700100000 }))
    expect(result.createdAt).toEqual(new Date(1700000000 * 1000))
    expect(result.updatedAt).toEqual(new Date(1700100000 * 1000))
  })

  describe('status mapping', () => {
    it('maps voided → CANCELLED', () => {
      expect(transformOrder(makeEstimate({ status: 'voided' })).status).toBe('CANCELLED')
    })

    it('maps declined → CANCELLED', () => {
      expect(transformOrder(makeEstimate({ status: 'declined' })).status).toBe('CANCELLED')
    })

    it('maps invoiced → COMPLETED', () => {
      expect(transformOrder(makeEstimate({ status: 'invoiced' })).status).toBe('COMPLETED')
    })

    it('maps draft → DRAFT', () => {
      expect(transformOrder(makeEstimate({ status: 'draft' })).status).toBe('DRAFT')
    })

    it('maps sent → ACTIVE', () => {
      expect(transformOrder(makeEstimate({ status: 'sent' })).status).toBe('ACTIVE')
    })

    it('maps approved → ACTIVE', () => {
      expect(transformOrder(makeEstimate({ status: 'approved' })).status).toBe('ACTIVE')
    })

    it('maps not_sent → ACTIVE', () => {
      expect(transformOrder(makeEstimate({ status: 'not_sent' })).status).toBe('ACTIVE')
    })
  })

  describe('line items', () => {
    it('maps line item fields', () => {
      const result = transformOrder(makeEstimate())
      const li = result.lineItems?.[0]
      expect(li?.id).toBe('301')
      expect(li?.itemName).toBe('Product One')
      expect(li?.itemDescription).toBe('A great product')
      expect(li?.unitAmount).toBe(2000)
      expect(li?.unitQuantity).toBe(3)
      expect(li?.totalAmount).toBe(6000)
    })

    it('maps catalog_item to itemId', () => {
      expect(transformOrder(makeEstimate()).lineItems?.[0]?.itemId).toBe('prod-001')
    })

    it('omits itemId when catalog_item is null', () => {
      const result = transformOrder(makeEstimate({ items: [makeLineItem({ catalog_item: null })] }))
      expect(result.lineItems?.[0]?.itemId).toBeUndefined()
    })

    it('produces empty lineItems array when items is empty', () => {
      expect(transformOrder(makeEstimate({ items: [] })).lineItems).toEqual([])
    })
  })

  it('passes raw object as metadata', () => {
    const raw = makeEstimate()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('passes OrderSchema validation', () => {
    const result = transformOrder(makeEstimate())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
