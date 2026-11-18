import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  mapOrderStatus,
  loginextDate,
} from '../../../../../../../src/verticals/logistics/adapters/loginext/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/logistics/schema/order'
import { docOrderRow, docOrderRowWithAwb } from '../fixtures'

describe('loginext transformOrder (Order Get API row)', () => {
  it('maps the documented example row and parses as an Order', () => {
    const raw = docOrderRow()
    const order = OrderSchema.parse(transformOrder(raw))
    expect(order.id).toBe('GR432U5')
    expect(order.orderNumber).toBe('GR432U5')
    expect(order.status).toBe('DELIVERED')
    expect(order.notes).toBe('Order recieved successfully.Thanks')
    expect(order.orderAt?.toISOString()).toBe(new Date(1485153536000).toISOString())
    expect(order.createdAt?.toISOString()).toBe(new Date(1485153536000).toISOString())
    expect(order.lineItems).toEqual([{ sku: 'R445', name: undefined, quantity: 10 }])
    expect(order.metadata).toEqual(raw)
  })

  it('reads no money: the response names no currency', () => {
    const order = OrderSchema.parse(transformOrder(docOrderRow()))
    expect(order.currency).toBeUndefined()
    expect(order.totalAmount).toBeUndefined()
    expect(order.shippingAmount).toBeUndefined()
  })

  it('keys by orderNo, not by the internal referenceId', () => {
    const order = transformOrder(docOrderRowWithAwb())
    expect(order.id).toBe('GR432U5')
    expect(order.id).not.toBe('f40cf4493a5949199775499b5750a272')
    expect(OrderSchema.parse(order).lineItems).toEqual([])
  })

  it('throws on a row without an orderNo rather than inventing an id', () => {
    expect(() => transformOrder({ ...docOrderRow(), orderNo: null })).toThrow(/orderNo/)
    expect(() => transformOrder({ ...docOrderRow(), orderNo: undefined })).toThrow(/orderNo/)
  })

  it('keeps a fractional itemQuantity out of the whole-number quantity', () => {
    const raw = docOrderRow()
    raw.shipmentCrateMappings![0]!.shipmentlineitems![0]!.itemQuantity = 2.5
    const order = OrderSchema.parse(transformOrder(raw))
    expect(order.lineItems?.[0]?.quantity).toBeUndefined()
  })

  it.each([
    ['NOTDISPATCHED', 'AWAITING_SHIPMENT'],
    ['INTRANSIT', 'SHIPPED'],
    ['PICKEDUP', 'SHIPPED'],
    ['DELIVERED', 'DELIVERED'],
    ['COMPLETED', 'DELIVERED'],
    ['CANCELLED', 'CANCELLED'],
    ['NOTDELIVERED', 'unknown'],
    ['NOTPICKEDUP', 'unknown'],
    ['NOTCOMPLETED', 'unknown'],
    ['SOMETHING_ELSE', 'unknown'],
    // Only the documented upper-case values are matched.
    ['delivered', 'unknown'],
  ] as const)('maps status %s to %s', (status, expected) => {
    expect(mapOrderStatus(status)).toBe(expected)
    expect(OrderSchema.parse(transformOrder({ ...docOrderRow(), status })).status).toBe(expected)
  })

  it('leaves status out when the row has none', () => {
    expect(transformOrder({ ...docOrderRow(), status: null }).status).toBeUndefined()
  })

  it('reads epoch-millisecond and ISO timestamps, and nothing else', () => {
    expect(loginextDate(1485153536000)?.toISOString()).toBe('2017-01-23T06:38:56.000Z')
    expect(loginextDate('2016-07-01T11:18:00.000Z')?.toISOString()).toBe('2016-07-01T11:18:00.000Z')
    expect(loginextDate(null)).toBeUndefined()
    expect(loginextDate('')).toBeUndefined()
    expect(loginextDate('not a date')).toBeUndefined()
  })
})
