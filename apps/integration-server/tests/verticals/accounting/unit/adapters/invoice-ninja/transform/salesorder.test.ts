import { describe, it, expect } from 'vitest'
import {
  transformSalesOrder,
  type InvoiceNinjaQuote,
} from '../../../../../../../src/verticals/accounting/adapters/invoice-ninja/transform/salesorder'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'

function makeSalesOrder(overrides: Partial<InvoiceNinjaQuote> = {}): InvoiceNinjaQuote {
  return {
    id: 'quote-1',
    status_id: 2,
    number: 'QUOTE-001',
    client_id: 'client-77',
    amount: 8000,
    currency_id: '3', // EUR
    date: '2024-04-01',
    due_date: '2024-05-01',
    public_notes: 'Quote for annual support contract',
    line_items: [
      {
        product_key: 'SUPPORT-ANNUAL',
        notes: 'Annual support plan',
        cost: 8000,
        quantity: 1,
        discount: 0,
        line_total: 8000,
      },
    ],
    created_at: 1700000000,
    updated_at: 1700100000,
    ...overrides,
  }
}

describe('transformSalesOrder', () => {
  it('maps id', () => {
    expect(transformSalesOrder(makeSalesOrder()).id).toBe('quote-1')
  })

  it('maps status_id=1 to DRAFT', () => {
    expect(transformSalesOrder(makeSalesOrder({ status_id: 1 })).status).toBe('DRAFT')
  })

  it('maps status_id=2 to ACTIVE', () => {
    expect(transformSalesOrder(makeSalesOrder({ status_id: 2 })).status).toBe('ACTIVE')
  })

  it('maps status_id=3 to ACTIVE (approved)', () => {
    expect(transformSalesOrder(makeSalesOrder({ status_id: 3 })).status).toBe('ACTIVE')
  })

  it('maps status_id=4 to COMPLETED', () => {
    expect(transformSalesOrder(makeSalesOrder({ status_id: 4 })).status).toBe('COMPLETED')
  })

  it('maps status_id=5 to CANCELLED', () => {
    expect(transformSalesOrder(makeSalesOrder({ status_id: 5 })).status).toBe('CANCELLED')
  })

  it('defaults to DRAFT for null status_id', () => {
    expect(transformSalesOrder(makeSalesOrder({ status_id: null })).status).toBe('DRAFT')
  })

  it('defaults to ACTIVE for unknown status_id', () => {
    expect(transformSalesOrder(makeSalesOrder({ status_id: 99 })).status).toBe('ACTIVE')
  })

  it('maps contactId from client_id', () => {
    expect(transformSalesOrder(makeSalesOrder()).contactId).toBe('client-77')
  })

  it('returns undefined contactId when client_id is absent', () => {
    expect(transformSalesOrder(makeSalesOrder({ client_id: null })).contactId).toBeUndefined()
  })

  it('maps currency_id=3 to EUR', () => {
    expect(transformSalesOrder(makeSalesOrder()).currency).toBe('EUR')
  })

  it('maps totalAmount from amount', () => {
    expect(transformSalesOrder(makeSalesOrder()).totalAmount).toBe(8000)
  })

  it('maps line items', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.itemId).toBe('SUPPORT-ANNUAL')
    expect(li.itemDescription).toBe('Annual support plan')
    expect(li.unitAmount).toBe(8000)
    expect(li.unitQuantity).toBe(1)
    expect(li.totalAmount).toBe(8000)
  })

  it('returns empty lineItems when line_items is null', () => {
    expect(transformSalesOrder(makeSalesOrder({ line_items: null })).lineItems).toEqual([])
  })

  it('maps postedAt from date string', () => {
    expect(transformSalesOrder(makeSalesOrder()).postedAt).toEqual(new Date('2024-04-01'))
  })

  it('maps createdAt from epoch (×1000)', () => {
    expect(transformSalesOrder(makeSalesOrder()).createdAt).toEqual(new Date(1700000000 * 1000))
  })

  it('maps updatedAt from epoch (×1000)', () => {
    expect(transformSalesOrder(makeSalesOrder()).updatedAt).toEqual(new Date(1700100000 * 1000))
  })

  it('passes raw object as metadata', () => {
    const raw = makeSalesOrder()
    expect(transformSalesOrder(raw).metadata).toBe(raw)
  })

  it('passes SalesOrderSchema validation', () => {
    expect(() => SalesOrderSchema.parse(transformSalesOrder(makeSalesOrder()))).not.toThrow()
  })
})
