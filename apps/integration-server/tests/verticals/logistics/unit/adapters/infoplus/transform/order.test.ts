/**
 * Fixture: the `order` and `orderLine` definitions of the v2.0 swagger
 * (https://developer.infopluscommerce.com/api/reference/v2.0/swagger.json).
 * The swagger ships no example body; every key below is one of their
 * properties, with a value of its declared type.
 */
import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type InfoplusOrder,
} from '../../../../../../../src/verticals/logistics/adapters/infoplus/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/logistics/schema/order'

const DOCUMENTED: InfoplusOrder = {
  orderNo: 1001,
  customerOrderNo: 'SHOP-42',
  lobId: 12,
  warehouseId: 7,
  orderDate: '2025-03-01T08:00:00.000Z',
  customerNo: 'CUST-9',
  serviceTypeId: 'GROUND',
  mediaCode: 'WEB',
  legacyRestrictionType: 'None',
  shipDate: '2025-03-01T15:00:00.000Z',
  createDate: '2025-03-01T08:00:05.000Z',
  modifyDate: '2025-03-01T15:01:00.000Z',
  status: 'Shipped',
  shipToAttention: 'Jane Doe',
  shipToCompany: 'Doe Co',
  shipToStreet: '1 Main St',
  shipToStreet2: 'Apt 2',
  shipToCity: 'Columbus',
  shipToState: 'OH',
  shipToZip: '43215',
  shipToCountry: 'United States',
  shipToPhone: '614-555-0101',
  shipToEmail: 'jane@example.com',
  subtotal: 79.99,
  total: 98.99,
  lineItems: [{ id: 9001, orderNo: 1001, lobId: 12, sku: 'KB-87', orderedQty: 2, unitSell: 39.99 }],
  customFields: {},
}

describe('infoplus transformOrder', () => {
  it('maps the documented fields and parses as an Order', () => {
    const out = OrderSchema.parse(transformOrder(DOCUMENTED))
    expect(out.id).toBe('1001')
    expect(out.orderNumber).toBe('SHOP-42')
    expect(out.customerId).toBe('CUST-9')
    expect(out.warehouseId).toBe('7')
    expect(out.requestedServiceCode).toBe('GROUND')
    expect(out.destinationAddress).toEqual({
      name: 'Jane Doe',
      company: 'Doe Co',
      street1: '1 Main St',
      street2: 'Apt 2',
      city: 'Columbus',
      state: 'OH',
      postalCode: '43215',
      phone: '614-555-0101',
      email: 'jane@example.com',
    })
    expect(out.lineItems).toEqual([{ id: '9001', sku: 'KB-87', quantity: 2 }])
    expect(out.orderAt).toEqual(new Date('2025-03-01T08:00:00.000Z'))
    expect(out.shippedAt).toEqual(new Date('2025-03-01T15:00:00.000Z'))
    expect(out.createdAt).toEqual(new Date('2025-03-01T08:00:05.000Z'))
    expect(out.updatedAt).toEqual(new Date('2025-03-01T15:01:00.000Z'))
  })

  it('maps no status, amounts or country the docs leave undefined', () => {
    const out = transformOrder(DOCUMENTED)
    expect(out.status).toBeUndefined()
    expect(out.subtotalAmount).toBeUndefined()
    expect(out.totalAmount).toBeUndefined()
    expect(out.currency).toBeUndefined()
    expect(out.destinationAddress?.country).toBeUndefined()
    expect(out.lineItems?.[0]?.unitAmount).toBeUndefined()
  })

  it('drops a malformed free-text email instead of failing the parse', () => {
    const out = OrderSchema.parse(transformOrder({ ...DOCUMENTED, shipToEmail: 'n/a' }))
    expect(out.destinationAddress?.email).toBeUndefined()
  })

  it('a line without orderedQty carries no quantity, not an invented 0', () => {
    const out = OrderSchema.parse(
      transformOrder({ ...DOCUMENTED, lineItems: [{ id: 9002, sku: 'KB-88' }] }),
    )
    expect(out.lineItems).toEqual([{ id: '9002', sku: 'KB-88' }])
    expect(out.lineItems?.[0]?.quantity).toBeUndefined()
  })

  it('an order with no line items has none', () => {
    expect(OrderSchema.parse(transformOrder({ orderNo: 1 })).lineItems).toBeUndefined()
  })
})
