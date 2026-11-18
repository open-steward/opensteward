import { describe, it, expect } from 'vitest'
import { transformSalesOrder } from '../../../../../../../src/verticals/accounting/adapters/invoiced/transform/salesorder'
import {
  type InvoicedEstimate,
  type InvoicedEstimateLineItem,
} from '../../../../../../../src/verticals/accounting/adapters/invoiced/transform/order'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'

function makeLineItem(overrides: Partial<InvoicedEstimateLineItem> = {}): InvoicedEstimateLineItem {
  return {
    id: 401,
    catalog_item: 'svc-001',
    name: 'Consulting Service',
    description: 'Monthly retainer',
    quantity: 1,
    unit_cost: 8000,
    amount: 8000,
    ...overrides,
  }
}

function makeEstimate(overrides: Partial<InvoicedEstimate> = {}): InvoicedEstimate {
  return {
    id: 7501,
    object: 'estimate',
    customer: 77,
    number: 'SO-7501',
    status: 'approved',
    draft: false,
    closed: false,
    approved: true,
    currency: 'gbp',
    date: 1700000000,
    expiration_date: 1702678400,
    items: [makeLineItem()],
    subtotal: 8000,
    total: 8000,
    notes: null,
    url: null,
    pdf_url: null,
    metadata: {},
    created_at: 1700000000,
    updated_at: 1700100000,
    ...overrides,
  }
}

describe('transformSalesOrder', () => {
  it('converts numeric id to string', () => {
    expect(transformSalesOrder(makeEstimate({ id: 7501 })).id).toBe('7501')
  })

  it('does not include a type field (SalesOrder has no type)', () => {
    const result = transformSalesOrder(makeEstimate())
    expect('type' in result).toBe(false)
  })

  it('converts customer number to contactId string', () => {
    expect(transformSalesOrder(makeEstimate({ customer: 77 })).contactId).toBe('77')
  })

  it('uppercases currency', () => {
    expect(transformSalesOrder(makeEstimate({ currency: 'gbp' })).currency).toBe('GBP')
  })

  it('maps total to totalAmount', () => {
    expect(transformSalesOrder(makeEstimate({ total: 8000 })).totalAmount).toBe(8000)
  })

  it('converts epoch date to postedAt', () => {
    const result = transformSalesOrder(makeEstimate({ date: 1700000000 }))
    expect(result.postedAt).toEqual(new Date(1700000000 * 1000))
  })

  it('sets postedAt to undefined when date is null', () => {
    expect(transformSalesOrder(makeEstimate({ date: null })).postedAt).toBeUndefined()
  })

  it('converts epoch seconds to Date for createdAt and updatedAt', () => {
    const result = transformSalesOrder(
      makeEstimate({ created_at: 1700000000, updated_at: 1700100000 }),
    )
    expect(result.createdAt).toEqual(new Date(1700000000 * 1000))
    expect(result.updatedAt).toEqual(new Date(1700100000 * 1000))
  })

  describe('status mapping', () => {
    it('maps voided → CANCELLED', () => {
      expect(transformSalesOrder(makeEstimate({ status: 'voided' })).status).toBe('CANCELLED')
    })

    it('maps declined → CANCELLED', () => {
      expect(transformSalesOrder(makeEstimate({ status: 'declined' })).status).toBe('CANCELLED')
    })

    it('maps invoiced → COMPLETED', () => {
      expect(transformSalesOrder(makeEstimate({ status: 'invoiced' })).status).toBe('COMPLETED')
    })

    it('maps draft → DRAFT', () => {
      expect(transformSalesOrder(makeEstimate({ status: 'draft' })).status).toBe('DRAFT')
    })

    it('maps approved → ACTIVE', () => {
      expect(transformSalesOrder(makeEstimate({ status: 'approved' })).status).toBe('ACTIVE')
    })

    it('maps sent → ACTIVE', () => {
      expect(transformSalesOrder(makeEstimate({ status: 'sent' })).status).toBe('ACTIVE')
    })

    it('maps not_sent → ACTIVE', () => {
      expect(transformSalesOrder(makeEstimate({ status: 'not_sent' })).status).toBe('ACTIVE')
    })
  })

  describe('line items', () => {
    it('maps line item fields', () => {
      const result = transformSalesOrder(makeEstimate())
      const li = result.lineItems?.[0]
      expect(li?.id).toBe('401')
      expect(li?.itemName).toBe('Consulting Service')
      expect(li?.itemDescription).toBe('Monthly retainer')
      expect(li?.unitAmount).toBe(8000)
      expect(li?.unitQuantity).toBe(1)
      expect(li?.totalAmount).toBe(8000)
    })

    it('maps catalog_item to itemId', () => {
      expect(transformSalesOrder(makeEstimate()).lineItems?.[0]?.itemId).toBe('svc-001')
    })

    it('omits itemId when catalog_item is null', () => {
      const result = transformSalesOrder(
        makeEstimate({ items: [makeLineItem({ catalog_item: null })] }),
      )
      expect(result.lineItems?.[0]?.itemId).toBeUndefined()
    })

    it('produces empty lineItems array when items is empty', () => {
      expect(transformSalesOrder(makeEstimate({ items: [] })).lineItems).toEqual([])
    })
  })

  it('passes raw object as metadata', () => {
    const raw = makeEstimate()
    expect(transformSalesOrder(raw).metadata).toBe(raw)
  })

  it('passes SalesOrderSchema validation', () => {
    const result = transformSalesOrder(makeEstimate())
    expect(() => SalesOrderSchema.parse(result)).not.toThrow()
  })
})
