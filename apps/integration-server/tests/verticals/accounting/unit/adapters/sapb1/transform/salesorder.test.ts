import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import {
  transformSalesOrder,
  type SapB1SalesOrder,
  type SapB1SalesOrderLine,
} from '../../../../../../../src/verticals/accounting/adapters/sapb1/transform/salesorder'

function makeSalesOrderLine(overrides: Partial<SapB1SalesOrderLine> = {}): SapB1SalesOrderLine {
  return {
    ItemCode: 'ITEM-003',
    ItemDescription: 'Gadget',
    Quantity: 4,
    UnitPrice: 75,
    LineTotal: 300,
    VatAmount: 60,
    AccountCode: 'ACCT-003',
    ...overrides,
  }
}

function makeSalesOrder(overrides: Partial<SapB1SalesOrder> = {}): SapB1SalesOrder {
  return {
    DocNum: 8001,
    CardCode: 'BP-003',
    DocDate: '2024-03-01',
    DocDueDate: '2024-04-01',
    DocCurrency: 'GBP',
    DocTotal: 2500,
    DocStatus: 'O',
    Cancelled: 'N',
    ...overrides,
  }
}

describe('transformSalesOrder', () => {
  it('maps DocNum as string to id', () => {
    expect(transformSalesOrder(makeSalesOrder()).id).toBe('8001')
  })

  it('maps CardCode to contactId', () => {
    expect(transformSalesOrder(makeSalesOrder()).contactId).toBe('BP-003')
  })

  it('maps DocCurrency to currency', () => {
    expect(transformSalesOrder(makeSalesOrder()).currency).toBe('GBP')
  })

  it('maps DocTotal to totalAmount', () => {
    expect(transformSalesOrder(makeSalesOrder()).totalAmount).toBe(2500)
  })

  it('parses DocDate as Date', () => {
    expect(transformSalesOrder(makeSalesOrder()).postedAt).toEqual(new Date('2024-03-01'))
  })

  it('maps Cancelled Y to CANCELLED', () => {
    expect(transformSalesOrder(makeSalesOrder({ Cancelled: 'Y' })).status).toBe('CANCELLED')
  })

  it('maps DocStatus C to COMPLETED when not cancelled', () => {
    expect(transformSalesOrder(makeSalesOrder({ DocStatus: 'C', Cancelled: 'N' })).status).toBe('COMPLETED')
  })

  it('maps open non-cancelled doc to ACTIVE', () => {
    expect(transformSalesOrder(makeSalesOrder({ DocStatus: 'O', Cancelled: 'N' })).status).toBe('ACTIVE')
  })

  it('maps DocumentLines to lineItems', () => {
    const result = transformSalesOrder(makeSalesOrder({ DocumentLines: [makeSalesOrderLine()] }))
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].itemId).toBe('ITEM-003')
    expect(result.lineItems![0].unitAmount).toBe(75)
    expect(result.lineItems![0].unitQuantity).toBe(4)
    expect(result.lineItems![0].totalAmount).toBe(300)
    expect(result.lineItems![0].taxAmount).toBe(60)
  })

  it('produces empty lineItems when DocumentLines is absent', () => {
    expect(transformSalesOrder(makeSalesOrder()).lineItems).toHaveLength(0)
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
