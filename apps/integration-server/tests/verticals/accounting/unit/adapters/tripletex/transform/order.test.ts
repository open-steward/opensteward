import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import {
  transformOrder,
  type TripletexOrder,
  type TripletexOrderLine,
} from '../../../../../../../src/verticals/accounting/adapters/tripletex/transform/order'

function makeOrderLine(overrides: Partial<TripletexOrderLine> = {}): TripletexOrderLine {
  return {
    id: 1,
    description: 'Widget A',
    count: 3,
    unitPriceExcludingVat: 100,
    amountExcludingVat: 300,
    product: { id: 9, name: 'Widget A' },
    ...overrides,
  }
}

function makeOrder(overrides: Partial<TripletexOrder> = {}): TripletexOrder {
  return {
    id: 505,
    orderDate: '2024-07-01',
    customer: { id: 88, name: 'Fjord Buyer AS' },
    amount: 3750,
    amountExcludingVat: 3000,
    currency: { id: '1', code: 'NOK' },
    isPrioritizeAmountsIncludingVat: false,
    isClosed: false,
    isCompleted: false,
    orderLines: [makeOrderLine()],
    ...overrides,
  }
}

describe('transformOrder', () => {
  it('maps id correctly', () => {
    expect(transformOrder(makeOrder()).id).toBe('505')
  })

  it('maps customer id to contactId', () => {
    expect(transformOrder(makeOrder()).contactId).toBe('88')
  })

  it('maps currency code correctly', () => {
    expect(transformOrder(makeOrder()).currency).toBe('NOK')
  })

  it('maps amount to totalAmount', () => {
    expect(transformOrder(makeOrder()).totalAmount).toBe(3750)
  })

  it('always sets type to SALES', () => {
    expect(transformOrder(makeOrder()).type).toBe('SALES')
  })

  it('parses orderDate as postedAt Date object', () => {
    expect(transformOrder(makeOrder()).postedAt).toEqual(new Date('2024-07-01'))
  })

  it('maps isClosed false and isCompleted false to ACTIVE', () => {
    expect(transformOrder(makeOrder({ isClosed: false, isCompleted: false })).status).toBe('ACTIVE')
  })

  it('maps isClosed true to COMPLETED', () => {
    expect(transformOrder(makeOrder({ isClosed: true, isCompleted: false })).status).toBe('COMPLETED')
  })

  it('maps isCompleted true to COMPLETED', () => {
    expect(transformOrder(makeOrder({ isClosed: false, isCompleted: true })).status).toBe('COMPLETED')
  })

  it('maps orderLines to lineItems', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems?.[0].itemDescription).toBe('Widget A')
    expect(result.lineItems?.[0].unitQuantity).toBe(3)
    expect(result.lineItems?.[0].totalAmount).toBe(300)
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
