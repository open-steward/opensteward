/** Fixture keys are OrderModel's documented attribute names (v5.8.0 REST/Models/OrderModel.php). */
import { describe, expect, it } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'
import { transformOrderModel } from '../../../../../../../src/verticals/ecommerce/adapters/jtl-shop/transform/order-model'

const ROW = {
  id: 1042,
  cartID: 88,
  customerID: 9,
  currencyID: 1,
  total: 79.99,
  orderNO: 'B-1042',
  comment: 'Bitte klingeln',
  state: '1',
  created: '2026-01-15 09:30:00',
  attributes: [],
}

describe('transformOrderModel', () => {
  it('maps the documented id, orderNO, customerID and comment, and parses as an Order', () => {
    const o = OrderSchema.parse(transformOrderModel(ROW))
    expect(o).toMatchObject({
      id: '1042',
      orderNumber: 'B-1042',
      customerId: '9',
      note: 'Bitte klingeln',
    })
    expect(o.metadata).toEqual(ROW)
  })

  it('builds no Money: the order has a currency id, not a currency code', () => {
    const o = transformOrderModel(ROW)
    expect(o.totalPrice).toBeUndefined()
    expect(o.currency).toBeUndefined()
    expect(o.financialStatus).toBeUndefined()
  })

  it('omits customerId for the documented default kKunde 0', () => {
    expect(
      OrderSchema.parse(transformOrderModel({ ...ROW, customerID: 0 })).customerId,
    ).toBeUndefined()
  })
})
