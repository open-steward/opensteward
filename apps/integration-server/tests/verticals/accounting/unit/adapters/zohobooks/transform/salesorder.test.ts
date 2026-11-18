import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import {
  transformSalesOrder,
  type ZohoBooksSalesOrder,
  type ZohoBooksSalesOrderLineItem,
} from '../../../../../../../src/verticals/accounting/adapters/zohobooks/transform/salesorder'

function makeSalesOrderLineItem(overrides: Partial<ZohoBooksSalesOrderLineItem> = {}): ZohoBooksSalesOrderLineItem {
  return {
    line_item_id: 'li-1',
    item_id: 'item-8',
    description: 'Annual Subscription',
    rate: 1200,
    quantity: 1,
    item_total: 1200,
    tax_amount: 120,
    account_id: 'acct-60',
    ...overrides,
  }
}

function makeSalesOrder(overrides: Partial<ZohoBooksSalesOrder> = {}): ZohoBooksSalesOrder {
  return {
    salesorder_id: 'so-001',
    salesorder_number: 'SO-2024-001',
    customer_id: 'cust-99',
    date: '2024-09-01',
    shipment_date: '2024-09-10',
    currency_code: 'USD',
    total: 1320,
    tax_total: 120,
    status: 'confirmed',
    line_items: [makeSalesOrderLineItem()],
    ...overrides,
  }
}

describe('transformSalesOrder', () => {
  it('maps salesorder_id to id', () => {
    expect(transformSalesOrder(makeSalesOrder()).id).toBe('so-001')
  })

  it('maps customer_id to contactId', () => {
    expect(transformSalesOrder(makeSalesOrder()).contactId).toBe('cust-99')
  })

  it('maps currency_code to currency', () => {
    expect(transformSalesOrder(makeSalesOrder()).currency).toBe('USD')
  })

  it('maps total to totalAmount', () => {
    expect(transformSalesOrder(makeSalesOrder()).totalAmount).toBe(1320)
  })

  it('parses date as postedAt Date object', () => {
    expect(transformSalesOrder(makeSalesOrder()).postedAt).toEqual(new Date('2024-09-01'))
  })

  it('maps status draft to ACTIVE', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'draft' })).status).toBe('ACTIVE')
  })

  it('maps status confirmed to ACTIVE', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'confirmed' })).status).toBe('ACTIVE')
  })

  it('maps status invoiced to COMPLETED', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'invoiced' })).status).toBe('COMPLETED')
  })

  it('maps status void to CANCELLED', () => {
    expect(transformSalesOrder(makeSalesOrder({ status: 'void' })).status).toBe('CANCELLED')
  })

  it('maps line_items to lineItems', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].itemDescription).toBe('Annual Subscription')
    expect(result.lineItems![0].unitQuantity).toBe(1)
    expect(result.lineItems![0].totalAmount).toBe(1200)
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeSalesOrder()
    expect(transformSalesOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(() => SalesOrderSchema.parse(result)).not.toThrow()
  })
})
