import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/logistics/schema/order'
import { transformOrder } from '../../../../../../../src/verticals/logistics/adapters/optimoroute/transform/order'
import { GET_ORDER_DATA, SEARCH_ORDER_DATA } from '../fixtures/search-orders'

describe('OptimoRoute transformOrder', () => {
  it('maps the documented search_orders order data and parses as an Order', () => {
    const order = OrderSchema.parse(transformOrder(SEARCH_ORDER_DATA))
    expect(order.id).toBe('cd013f61ad8155802ad4321f2b411f4f')
    expect(order.orderNumber).toBe('10205')
    expect(order.orderAt).toEqual(new Date('2022-01-03T00:00:00.000Z'))
    expect(order.destinationAddress).toEqual({
      street1: 'Moneta, VA 24121, United States',
      name: 'T1275',
    })
    // Empty documented strings are not values.
    expect(order.notes).toBeUndefined()
    expect(order.metadata).toEqual(SEARCH_ORDER_DATA)
  })

  it('maps the documented get_orders order data and parses as an Order', () => {
    const order = OrderSchema.parse(transformOrder(GET_ORDER_DATA))
    expect(order.id).toBe('04e7b09e993e8488024f46aaf9d8c72d')
    expect(order.orderNumber).toBe('ORD001')
    expect(order.destinationAddress).toEqual({
      street1: '393 Hanover St, Boston, MA 02113, USA',
      name: 'Green Cross Pharmacy North End',
    })
  })

  it('invents no status, amounts, currency or creation time: the Order Object has none', () => {
    const order = OrderSchema.parse(transformOrder(SEARCH_ORDER_DATA))
    expect(order.status).toBeUndefined()
    expect(order.currency).toBeUndefined()
    expect(order.totalAmount).toBeUndefined()
    expect(order.createdAt).toBeUndefined()
  })

  it('carries notes and phone when present', () => {
    const order = OrderSchema.parse(
      transformOrder({ ...SEARCH_ORDER_DATA, notes: 'Gate 4', phone: '+1 555 0100' }),
    )
    expect(order.notes).toBe('Gate 4')
    expect(order.destinationAddress?.phone).toBe('+1 555 0100')
  })

  it('omits the address when the location is null', () => {
    const order = OrderSchema.parse(transformOrder({ ...SEARCH_ORDER_DATA, location: null }))
    expect(order.destinationAddress).toBeUndefined()
  })

  it('reads date as that UTC day whatever the process time zone', () => {
    const tz = process.env.TZ
    process.env.TZ = 'America/New_York'
    try {
      const order = OrderSchema.parse(transformOrder(SEARCH_ORDER_DATA))
      expect(order.orderAt?.toISOString()).toBe('2022-01-03T00:00:00.000Z')
    } finally {
      if (tz === undefined) delete process.env.TZ
      else process.env.TZ = tz
    }
  })

  it('reads only the documented YYYY-MM-DD date format', () => {
    for (const date of ['+002022-01-03', '2022-01-03T10:00:00', '03/01/2022']) {
      const order = OrderSchema.parse(transformOrder({ ...SEARCH_ORDER_DATA, date }))
      expect(order.orderAt).toBeUndefined()
    }
  })

  it('throws rather than inventing an id', () => {
    expect(() => transformOrder({ ...SEARCH_ORDER_DATA, id: '' })).toThrow(/no id/)
  })
})
