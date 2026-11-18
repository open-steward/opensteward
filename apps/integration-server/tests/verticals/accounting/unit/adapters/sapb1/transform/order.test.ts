import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import {
  transformOrder,
  type SapB1Order,
  type SapB1OrderLine,
} from '../../../../../../../src/verticals/accounting/adapters/sapb1/transform/order'

function makeOrderLine(overrides: Partial<SapB1OrderLine> = {}): SapB1OrderLine {
  return {
    ItemCode: 'ITEM-001',
    ItemDescription: 'Widget',
    Quantity: 3,
    UnitPrice: 150,
    LineTotal: 450,
    VatAmount: 90,
    AccountCode: 'ACCT-001',
    ...overrides,
  }
}

function makeOrder(overrides: Partial<SapB1Order> = {}): SapB1Order {
  return {
    DocNum: 6001,
    CardCode: 'BP-001',
    DocDate: '2024-03-01',
    DocDueDate: '2024-04-01',
    DocCurrency: 'USD',
    DocTotal: 1800,
    DocStatus: 'O',
    Cancelled: 'N',
    ...overrides,
  }
}

describe('transformOrder', () => {
  it('maps DocNum as string to id', () => {
    expect(transformOrder(makeOrder()).id).toBe('6001')
  })

  it('maps CardCode to contactId', () => {
    expect(transformOrder(makeOrder()).contactId).toBe('BP-001')
  })

  it('maps DocCurrency to currency', () => {
    expect(transformOrder(makeOrder()).currency).toBe('USD')
  })

  it('sets type to SALES', () => {
    expect(transformOrder(makeOrder()).type).toBe('SALES')
  })

  it('maps DocTotal to totalAmount', () => {
    expect(transformOrder(makeOrder()).totalAmount).toBe(1800)
  })

  it('parses DocDate as Date', () => {
    expect(transformOrder(makeOrder()).postedAt).toEqual(new Date('2024-03-01'))
  })

  it('maps Cancelled Y to CANCELLED', () => {
    expect(transformOrder(makeOrder({ Cancelled: 'Y' })).status).toBe('CANCELLED')
  })

  it('maps DocStatus C to COMPLETED when not cancelled', () => {
    expect(transformOrder(makeOrder({ DocStatus: 'C', Cancelled: 'N' })).status).toBe('COMPLETED')
  })

  it('maps open non-cancelled doc to ACTIVE', () => {
    expect(transformOrder(makeOrder({ DocStatus: 'O', Cancelled: 'N' })).status).toBe('ACTIVE')
  })

  it('maps DocumentLines to lineItems', () => {
    const result = transformOrder(makeOrder({ DocumentLines: [makeOrderLine()] }))
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].itemId).toBe('ITEM-001')
    expect(result.lineItems![0].unitAmount).toBe(150)
    expect(result.lineItems![0].unitQuantity).toBe(3)
    expect(result.lineItems![0].totalAmount).toBe(450)
    expect(result.lineItems![0].taxAmount).toBe(90)
  })

  it('produces empty lineItems when DocumentLines is absent', () => {
    expect(transformOrder(makeOrder()).lineItems).toHaveLength(0)
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeOrder()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
