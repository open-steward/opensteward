import { describe, it, expect } from 'vitest'
import { transformOrder } from '../../../../../../../src/verticals/accounting/adapters/billit/transform/order'
import type { BillitOrder } from '../../../../../../../src/verticals/accounting/adapters/billit/transform/invoice'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'

function makeOrder(overrides: Partial<BillitOrder> = {}): BillitOrder {
  return {
    OrderID: 55,
    OrderNumber: 'ORD-055',
    OrderType: 'OrderForm',
    OrderDirection: 'Income',
    OrderStatus: 'ToPay',
    Paid: false,
    Currency: 'EUR',
    TotalIncl: 18000,
    TotalVAT: 3000,
    ToPay: 18000,
    OrderDate: '2024-05-10',
    CounterParty: { PartyID: 'cust-5', Name: 'Order Customer' },
    ...overrides,
  }
}

describe('transformOrder', () => {
  it('maps OrderID to id as string', () => {
    expect(transformOrder(makeOrder()).id).toBe('55')
  })

  it('maps CounterParty.PartyID to contactId', () => {
    expect(transformOrder(makeOrder()).contactId).toBe('cust-5')
  })

  it('falls back to Customer then Supplier for contactId', () => {
    const raw = makeOrder({
      CounterParty: undefined,
      Customer: { PartyID: 'cust-fallback' },
    })
    expect(transformOrder(raw).contactId).toBe('cust-fallback')
  })

  it('falls back to Supplier.Nr if no CounterParty or Customer', () => {
    const raw = makeOrder({
      CounterParty: undefined,
      Customer: undefined,
      Supplier: { Nr: 'sup-nr-5' },
    })
    expect(transformOrder(raw).contactId).toBe('sup-nr-5')
  })

  it('maps OrderDirection=Cost to type PURCHASE', () => {
    expect(transformOrder(makeOrder({ OrderDirection: 'Cost' })).type).toBe('PURCHASE')
  })

  it('maps OrderDirection=Income to type SALES', () => {
    expect(transformOrder(makeOrder({ OrderDirection: 'Income' })).type).toBe('SALES')
  })

  it('defaults to SALES when OrderDirection absent', () => {
    expect(transformOrder(makeOrder({ OrderDirection: undefined })).type).toBe('SALES')
  })

  it('maps ToPay status to ACTIVE', () => {
    expect(transformOrder(makeOrder({ OrderStatus: 'ToPay' })).status).toBe('ACTIVE')
  })

  it('maps tosend status to ACTIVE', () => {
    expect(transformOrder(makeOrder({ OrderStatus: 'ToSend' })).status).toBe('ACTIVE')
  })

  it('maps sent status to ACTIVE', () => {
    expect(transformOrder(makeOrder({ OrderStatus: 'Sent' })).status).toBe('ACTIVE')
  })

  it('maps Paid status to COMPLETED', () => {
    expect(transformOrder(makeOrder({ OrderStatus: 'Paid' })).status).toBe('COMPLETED')
  })

  it('maps Paid=true boolean to COMPLETED', () => {
    expect(transformOrder(makeOrder({ OrderStatus: 'ToPay', Paid: true })).status).toBe('COMPLETED')
  })

  it('maps Canceled status to CANCELLED', () => {
    expect(transformOrder(makeOrder({ OrderStatus: 'Canceled' })).status).toBe('CANCELLED')
  })

  it('maps Draft status to DRAFT', () => {
    expect(transformOrder(makeOrder({ OrderStatus: 'Draft' })).status).toBe('DRAFT')
  })

  it('maps TotalIncl to totalAmount', () => {
    expect(transformOrder(makeOrder()).totalAmount).toBe(18000)
  })

  it('parses OrderDate as Date object', () => {
    const result = transformOrder(makeOrder())
    expect(result.postedAt).toEqual(new Date('2024-05-10'))
  })

  it('passes schema validation', () => {
    expect(() => OrderSchema.parse(transformOrder(makeOrder()))).not.toThrow()
  })

  it('passes raw object as metadata', () => {
    const raw = makeOrder()
    expect(transformOrder(raw).metadata).toBe(raw)
  })
})
