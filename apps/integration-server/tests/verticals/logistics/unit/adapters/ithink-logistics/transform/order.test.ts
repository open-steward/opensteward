import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  mapOrderStatus,
  type IthinkLogisticsOrderRaw,
} from '../../../../../../../src/verticals/logistics/adapters/ithink-logistics/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/logistics/schema/order'
import { docOrderRow } from '../fixtures'

const row = (o: Partial<IthinkLogisticsOrderRaw> = {}) =>
  ({ ...docOrderRow(), ...o }) as IthinkLogisticsOrderRaw

describe('ithink-logistics transformOrder (documented order/get_details.json row)', () => {
  it('parses against OrderSchema', () => {
    expect(() => OrderSchema.parse(transformOrder(row()))).not.toThrow()
  })

  it('keys the order by its AWB and reads documented fields', () => {
    const o = OrderSchema.parse(transformOrder(row()))
    expect(o.id).toBe('12345678984394')
    expect(o.shipmentIds).toEqual(['12345678984394'])
    expect(o.orderNumber).toBe('9999_85155972')
    expect(o.status).toBe('DELIVERED')
    expect(o.warehouseId).toBe('20542')
  })

  it('maps the customer_* fields to the destination address, without a country name', () => {
    const o = OrderSchema.parse(transformOrder(row()))
    expect(o.destinationAddress).toEqual({
      name: 'Anjulika N',
      company: 'iThink test1',
      street1: 'gurugram palace, mumbai,',
      street2: 'Maharashtra',
      city: 'Mumbai',
      state: 'Maharashtra',
      postalCode: '100039',
      email: 'anas@gmail.com',
    })
  })

  it('does not treat the billing address as the origin', () => {
    expect(transformOrder(row()).originAddress).toBeUndefined()
  })

  it('maps products to line items without currency-less amounts', () => {
    const o = OrderSchema.parse(transformOrder(row()))
    expect(o.lineItems).toEqual([
      { sku: 'DHF', name: 'Testing Product', quantity: 1 },
      { sku: 'BODY_BTR-150G', name: 'Baby Body Butter', quantity: 1 },
    ])
  })

  it('sets no amount or currency: the docs name no currency', () => {
    const o = transformOrder(row())
    expect(o.totalAmount).toBeUndefined()
    expect(o.currency).toBeUndefined()
  })

  it('sets no dates: the documented timestamps carry no time zone', () => {
    const o = transformOrder(row())
    expect(o.orderAt).toBeUndefined()
    expect(o.createdAt).toBeUndefined()
    expect(o.updatedAt).toBeUndefined()
    expect(o.metadata?.['order_date']).toBe('2022-04-10 08:57:27')
  })

  it('throws on a row with no awb_no rather than invent an id', () => {
    expect(() => transformOrder(row({ awb_no: '' }))).toThrow(/awb_no/)
  })

  it('drops an invalid email instead of failing the row', () => {
    const o = OrderSchema.parse(transformOrder(row({ customer_email: 'not-an-email' })))
    expect(o.destinationAddress?.email).toBeUndefined()
  })

  it('maps the documented courier statuses', () => {
    const cases: Array<[string, string]> = [
      ['Manifested', 'AWAITING_SHIPMENT'],
      ['Not Picked', 'AWAITING_SHIPMENT'],
      ['In Transit', 'SHIPPED'],
      ['Out For Delivery', 'SHIPPED'],
      ['delivered', 'DELIVERED'],
      ['Cancelled', 'CANCELLED'],
      ['RTO Delivered', 'RETURNED'],
      ['Lost', 'unknown'],
      ['something else', 'unknown'],
    ]
    for (const [s, want] of cases) {
      expect(mapOrderStatus(s)).toBe(want)
      expect(OrderSchema.parse(transformOrder(row({ latest_courier_status: s }))).status).toBe(want)
    }
    expect(mapOrderStatus(null)).toBe('unknown')
  })
})

describe('ithink-logistics transformOrder product_quantity', () => {
  const qty = (q: string) =>
    transformOrder(row({ products: [{ product_sku: 'X', product_quantity: q }] })).lineItems?.[0]
      ?.quantity

  it('keeps a whole, non-negative quantity', () => {
    expect(qty('3')).toBe(3)
    expect(qty('0')).toBe(0)
  })

  it('leaves out a quantity that is fractional, negative or not a number, instead of guessing', () => {
    expect(qty('1.5')).toBeUndefined()
    expect(qty('-1')).toBeUndefined()
    expect(qty('abc')).toBeUndefined()
    for (const q of ['1.5', '-1', 'abc'])
      expect(() =>
        OrderSchema.parse(
          transformOrder(row({ products: [{ product_sku: 'X', product_quantity: q }] })),
        ),
      ).not.toThrow()
  })
})
