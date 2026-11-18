import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/logistics/schema/order'
import { transformShipmentConfirmationOrder } from '../../../../../../../src/verticals/logistics/adapters/geodis/transform/shipment-confirmation'
import { DOC_ORDER } from '../fixtures'

describe('geodis transformShipmentConfirmationOrder', () => {
  it('maps the documented example row onto a valid Order', () => {
    const order = OrderSchema.parse(transformShipmentConfirmationOrder(DOC_ORDER))
    expect(order.id).toBe('104054947')
    expect(order.orderNumber).toBe('1047902808')
    expect(order.warehouseId).toBe('ABC')
    expect(order.status).toBe('SHIPPED')
    expect(order.destinationAddress).toEqual({
      street1: '1234 Sample Road',
      city: 'Cincinnati',
      state: 'OH',
      postalCode: 'USA',
    })
    expect(order.lineItems).toEqual([{ id: '1292798096', sku: '011113570', quantity: 4 }])
    expect(order.requestedServiceCode).toBeUndefined()
    expect(order.metadata).toMatchObject({ carrier: 'AACT', shipmentDate: '10/22/2019 2:06:24 PM' })
  })

  it('leaves out the alpha-3 country and the zone-less shipmentDate', () => {
    const order = transformShipmentConfirmationOrder(DOC_ORDER)
    expect(order.destinationAddress?.country).toBeUndefined()
    expect(order.shippedAt).toBeUndefined()
    expect(order.currency).toBeUndefined()
    expect(order.totalAmount).toBeUndefined()
  })

  it('sums one order line across cartons and lots, once per orderLineNumber', () => {
    const lot = (q: string) => ({ lotNumber: 'L', unitOfMeasure: 'EA', shippedQuantity: q })
    const order = OrderSchema.parse(
      transformShipmentConfirmationOrder({
        ...DOC_ORDER,
        shipment: {
          carton: [
            {
              lpid: 'c1',
              line: [{ orderLineNumber: '1', item: 'A', lotInfo: [lot('2'), lot('3')] }],
            },
            {
              lpid: 'c2',
              line: [
                { orderLineNumber: '1', item: 'A', lotInfo: [lot('1')] },
                { orderLineNumber: '2', item: 'B', lotInfo: [lot('7')] },
              ],
            },
          ],
        },
      }),
    )
    expect(order.lineItems).toEqual([
      { id: '1', sku: 'A', quantity: 6 },
      { id: '2', sku: 'B', quantity: 7 },
    ])
  })

  it('skips a line without an orderLineNumber rather than giving it no id', () => {
    const lot = { lotNumber: 'L', unitOfMeasure: 'EA', shippedQuantity: '2' }
    const order = OrderSchema.parse(
      transformShipmentConfirmationOrder({
        ...DOC_ORDER,
        shipment: {
          carton: [
            {
              lpid: 'c1',
              line: [
                { orderLineNumber: null, item: 'X', lotInfo: [lot] },
                { orderLineNumber: '1', item: 'A', lotInfo: [lot] },
              ],
            },
          ],
        },
      }),
    )
    expect(order.lineItems).toEqual([{ id: '1', sku: 'A', quantity: 2 }])
  })

  it('gives a line with an unreadable shipped quantity no quantity rather than a guess', () => {
    const order = OrderSchema.parse(
      transformShipmentConfirmationOrder({
        ...DOC_ORDER,
        shipment: {
          carton: [
            {
              line: [
                {
                  orderLineNumber: '1',
                  item: 'A',
                  lotInfo: [{ shippedQuantity: '2' }, { shippedQuantity: null }],
                },
              ],
            },
          ],
        },
      }),
    )
    expect(order.lineItems).toEqual([{ id: '1', sku: 'A', quantity: null }])
  })

  it('reads the carrier service when present', () => {
    expect(
      transformShipmentConfirmationOrder({ ...DOC_ORDER, service: 'U7' }).requestedServiceCode,
    ).toBe('U7')
  })

  it('throws on a row without orderId instead of inventing an id', () => {
    expect(() => transformShipmentConfirmationOrder({ ...DOC_ORDER, orderId: null })).toThrow(
      /orderId/,
    )
  })
})
