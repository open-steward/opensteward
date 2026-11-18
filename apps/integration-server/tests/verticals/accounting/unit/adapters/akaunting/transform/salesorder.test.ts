import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import {
  transformSalesOrder,
  type AkauntingSalesOrder,
} from '../../../../../../../src/verticals/accounting/adapters/akaunting/transform/salesorder'

function makeSalesOrder(overrides: Partial<AkauntingSalesOrder> = {}): AkauntingSalesOrder {
  return {
    id: 55,
    document_number: 'SO-55',
    contact_id: 9,
    contact_name: 'Customer Inc',
    currency_code: 'GBP',
    issued_at: '2024-01-15',
    status: 'active',
    amount: 3000,
    tax_total: 300,
    category_id: 1,
    items: [],
    ...overrides,
  }
}

describe('transformSalesOrder', () => {
  it('maps id to string id', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.id).toBe('55')
  })

  it('maps contact_id to contactId as string', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.contactId).toBe('9')
  })

  it('maps currency_code to currency', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.currency).toBe('GBP')
  })

  it('maps amount to totalAmount', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.totalAmount).toBe(3000)
  })

  it('parses issued_at as Date', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.postedAt).toEqual(new Date('2024-01-15'))
  })

  it('maps active status to ACTIVE', () => {
    const result = transformSalesOrder(makeSalesOrder({ status: 'active' }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps draft status to DRAFT', () => {
    const result = transformSalesOrder(makeSalesOrder({ status: 'draft' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps completed status to COMPLETED', () => {
    const result = transformSalesOrder(makeSalesOrder({ status: 'completed' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps invoiced status to COMPLETED', () => {
    const result = transformSalesOrder(makeSalesOrder({ status: 'invoiced' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps cancelled status to CANCELLED', () => {
    const result = transformSalesOrder(makeSalesOrder({ status: 'cancelled' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps voided status to CANCELLED', () => {
    const result = transformSalesOrder(makeSalesOrder({ status: 'voided' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps items to lineItems', () => {
    const raw = makeSalesOrder({
      items: [
        {
          id: 30,
          item_id: 4,
          name: 'Service',
          description: 'A service',
          quantity: 2,
          price: 200,
          total: 400,
          tax: 40,
          tax_id: 1,
        },
      ],
    })
    const result = transformSalesOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('30')
    expect(li.itemId).toBe('4')
    expect(li.itemDescription).toBe('A service')
    expect(li.unitAmount).toBe(200)
    expect(li.unitQuantity).toBe(2)
    expect(li.totalAmount).toBe(400)
    expect(li.taxAmount).toBe(40)
    expect(li.taxrateId).toBe('1')
  })

  it('passes raw object as metadata (reference equality)', () => {
    const raw = makeSalesOrder()
    expect(transformSalesOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(() => SalesOrderSchema.parse(result)).not.toThrow()
  })
})
