import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/logistics/schema/order'
import {
  parseOrderInfo,
  transformOrder,
} from '../../../../../../../src/verticals/logistics/adapters/bpost/transform/order'
import { parseXml } from '../../../../../../../src/verticals/logistics/adapters/bpost/xml'
import { ORDER_INFO, ORDER_REFERENCE, orderInfoWithBoxes } from '../fixtures'

const order = (xml: string) => OrderSchema.parse(transformOrder(parseOrderInfo(parseXml(xml))))

describe('bpost transformOrder (GET /{accountId}/orders/{reference})', () => {
  it('maps the documented Retrieve Order example', () => {
    const o = order(ORDER_INFO)
    expect(o.id).toBe(ORDER_REFERENCE)
    expect(o.orderNumber).toBe(ORDER_REFERENCE)
    expect(o.status).toBe('PENDING')
    expect(o.lineItems).toEqual([
      { name: 'Product 1', quantity: 5 },
      { name: 'Product 1', quantity: 1 },
    ])
    // Neither documented box has a barcode yet.
    expect(o.shipmentIds).toBeUndefined()
  })

  it('leaves a non-integer nbOfItems unset rather than guessing a quantity', () => {
    const o = order(ORDER_INFO.replace('<nbOfItems>5</nbOfItems>', '<nbOfItems>five</nbOfItems>'))
    expect(o.lineItems?.[0]).toEqual({ name: 'Product 1' })
  })

  it('reads the per-box fields', () => {
    const raw = parseOrderInfo(parseXml(ORDER_INFO))
    expect(raw.accountId).toBe('123456')
    expect(raw.costCenter).toBe('Cost Center')
    expect(raw.box).toHaveLength(2)
    expect(raw.box?.[0]).toEqual({
      barcode: undefined,
      additionalBarcode: undefined,
      status: 'PENDING',
      remark: 'bpack 24h B2B VAS 126 - Ins(El)+iR+iND+iD',
      additionalCustomerReference: 'Reference that can be used for cross-referencing',
    })
  })

  it('does not read a nested sender <box> (address box number) as a parcel box', () => {
    const raw = parseOrderInfo(parseXml(ORDER_INFO))
    expect(raw.box?.every((b) => b.status === 'PENDING')).toBe(true)
  })

  it('lists box barcodes as shipment ids', () => {
    const o = order(
      orderInfoWithBoxes([
        { barcode: '323212345659900040669030', status: 'PRINTED' },
        { barcode: '323212345659900040669031', status: 'PRINTED' },
      ]),
    )
    expect(o.shipmentIds).toEqual(['323212345659900040669030', '323212345659900040669031'])
    expect(o.status).toBe('AWAITING_SHIPMENT')
    expect(o.lineItems).toEqual([{ name: 'Product 1', quantity: undefined }])
  })

  it.each([
    ['PENDING', 'PENDING'],
    ['OPEN', 'PROCESSING'],
    ['CANCELLED', 'CANCELLED'],
    ['ON-HOLD', 'ON_HOLD'],
    ['PRINTED', 'AWAITING_SHIPMENT'],
    ['ANNOUNCED', 'SHIPPED'],
    ['IN_TRANSIT', 'SHIPPED'],
    ['AWAITING_PICKUP', 'SHIPPED'],
    ['DELIVERED', 'DELIVERED'],
    ['BACK_TO_SENDER', 'RETURNED'],
  ])('maps the documented box status %s to %s', (boxStatus, expected) => {
    expect(order(orderInfoWithBoxes([{ status: boxStatus }])).status).toBe(expected)
  })

  it('is unknown when the boxes disagree, or carry an undocumented status', () => {
    expect(order(orderInfoWithBoxes([{ status: 'PRINTED' }, { status: 'DELIVERED' }])).status).toBe(
      'unknown',
    )
    expect(order(orderInfoWithBoxes([{ status: 'LOST' }])).status).toBe('unknown')
  })

  it('refuses an orderInfo without a reference, and any other document', () => {
    expect(() =>
      parseOrderInfo(parseXml('<orderInfo><accountId>1</accountId></orderInfo>')),
    ).toThrow(/reference/)
    expect(() => parseOrderInfo(parseXml('<productConfiguration/>'))).toThrow(/orderInfo/)
  })
})
