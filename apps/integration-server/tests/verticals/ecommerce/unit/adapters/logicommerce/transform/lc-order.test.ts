import { describe, it, expect } from 'vitest'
import {
  transformLogicommerceOrder,
  type RawLogicommerceOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/logicommerce/transform/lc-order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'
import { fixture } from '../fixtures/load'

const listed = fixture<{ ORDERS: RawLogicommerceOrder[] }>('orders').ORDERS[0]!
const single = fixture<RawLogicommerceOrder>('order')

describe('transformLogicommerceOrder', () => {
  it('maps the documented GET /orders row to a valid canonical Order', () => {
    const out = OrderSchema.parse(transformLogicommerceOrder(listed))
    expect(out).toMatchObject({
      id: '606',
      orderNumber: '1122',
      createdAt: '2021-09-13T07:23:17.000Z',
    })
    expect(out.email).toBeUndefined()
    expect(out.metadata).toEqual(listed)
  })

  it('maps the documented GET /orders/{id} example to a valid canonical Order', () => {
    const out = OrderSchema.parse(transformLogicommerceOrder(single))
    expect(out).toMatchObject({
      id: '108',
      orderNumber: '1122',
      email: 'info@logicommerce.com',
      note: 'Order comment',
      createdAt: '2020-06-29T05:52:43.000Z',
    })
    expect(out.metadata).toEqual(single)
  })

  it('leaves out a USER.EMAIL that is not an address', () => {
    const out = OrderSchema.parse(
      transformLogicommerceOrder({ ...single, USER: { ...single.USER, EMAIL: 'string' } }),
    )
    expect(out.email).toBeUndefined()
  })

  it('maps no money and no customer id: no documented currency, and USER is not an account', () => {
    const out = transformLogicommerceOrder(single)
    expect(out.totalPrice).toBeUndefined()
    expect(out.currency).toBeUndefined()
    expect(out.lineItems).toBeUndefined()
    expect(out.customerId).toBeUndefined()
  })
})
