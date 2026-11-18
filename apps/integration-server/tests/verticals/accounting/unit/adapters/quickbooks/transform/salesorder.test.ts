import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import {
  transformSalesOrder,
  type QBOSalesOrder,
  type QBOSalesOrderLine,
} from '../../../../../../../src/verticals/accounting/adapters/quickbooks/transform/salesorder'

function makeSalesOrderLine(overrides: Partial<QBOSalesOrderLine> = {}): QBOSalesOrderLine {
  return {
    Id: 'line-1',
    Description: 'Widget A',
    Amount: 200,
    DetailType: 'SalesItemLineDetail',
    SalesItemLineDetail: { ItemRef: { value: 'item-3' }, UnitPrice: 100, Qty: 2 },
    ...overrides,
  }
}

function makeSalesOrder(overrides: Partial<QBOSalesOrder> = {}): QBOSalesOrder {
  return {
    Id: 'so-1',
    DocNumber: 'SO-2024-001',
    CustomerRef: { value: 'cust-2' },
    TxnDate: '2024-02-10',
    TotalAmt: 800,
    TxnStatus: 'Open',
    CurrencyRef: { value: 'USD' },
    Line: [],
    ...overrides,
  }
}

describe('transformSalesOrder', () => {
  it('maps Id to id correctly', () => {
    expect(transformSalesOrder(makeSalesOrder()).id).toBe('so-1')
  })

  it('maps CustomerRef.value to contactId', () => {
    expect(transformSalesOrder(makeSalesOrder()).contactId).toBe('cust-2')
  })

  it('maps CurrencyRef.value to currency', () => {
    expect(transformSalesOrder(makeSalesOrder()).currency).toBe('USD')
  })

  it('maps TotalAmt to totalAmount', () => {
    expect(transformSalesOrder(makeSalesOrder()).totalAmount).toBe(800)
  })

  it('parses TxnDate as Date object for postedAt', () => {
    expect(transformSalesOrder(makeSalesOrder()).postedAt).toEqual(new Date('2024-02-10'))
  })

  it('maps TxnStatus Closed to COMPLETED', () => {
    expect(transformSalesOrder(makeSalesOrder({ TxnStatus: 'Closed' })).status).toBe('COMPLETED')
  })

  it('maps TxnStatus Fulfilled to COMPLETED', () => {
    expect(transformSalesOrder(makeSalesOrder({ TxnStatus: 'Fulfilled' })).status).toBe('COMPLETED')
  })

  it('maps TxnStatus Cancelled to CANCELLED', () => {
    expect(transformSalesOrder(makeSalesOrder({ TxnStatus: 'Cancelled' })).status).toBe('CANCELLED')
  })

  it('maps TxnStatus Pending to DRAFT', () => {
    expect(transformSalesOrder(makeSalesOrder({ TxnStatus: 'Pending' })).status).toBe('DRAFT')
  })

  it('maps other TxnStatus values to ACTIVE', () => {
    expect(transformSalesOrder(makeSalesOrder({ TxnStatus: 'Open' })).status).toBe('ACTIVE')
    expect(transformSalesOrder(makeSalesOrder({ TxnStatus: 'Unknown' })).status).toBe('ACTIVE')
  })

  it('maps SalesItemLineDetail lines to lineItems', () => {
    const line = makeSalesOrderLine()
    const result = transformSalesOrder(makeSalesOrder({ Line: [line] }))
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0]).toMatchObject({
      id: 'line-1',
      itemId: 'item-3',
      itemDescription: 'Widget A',
      unitAmount: 100,
      unitQuantity: 2,
      totalAmount: 200,
    })
  })

  it('filters out non-SalesItemLineDetail lines', () => {
    const line = makeSalesOrderLine({ DetailType: 'SubTotalLineDetail' })
    const result = transformSalesOrder(makeSalesOrder({ Line: [line] }))
    expect(result.lineItems).toHaveLength(0)
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
