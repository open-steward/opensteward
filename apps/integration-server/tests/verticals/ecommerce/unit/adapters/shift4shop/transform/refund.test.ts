/**
 * Shift4Shop RMA → canonical Refund.
 *
 * The fixture is the documented example response of
 * `GET https://apirest.3dcart.com/3dCartWebAPI/v1/RMA`
 * (https://apirest.3dcart.com/v1/rma/index.html). Field meanings come from the
 * RMA and RMAItem object definitions
 * (https://apirest.3dcart.com/v1/object-definitions/index.html).
 */
import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawShift4ShopRMA,
} from '../../../../../../../src/verticals/ecommerce/adapters/shift4shop/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

/** The documented example RMA, verbatim. */
function documentedRma(): RawShift4ShopRMA {
  return {
    RMAID: 1,
    RmaDate: '03/28/2019 17:28',
    OrderID: 1,
    RMAReasonID: 1,
    RMAMethodID: 1,
    RMAStatusID: 1,
    Comments: 'sample string 1',
    InternalComments: 'sample string 2',
    StaffComments: 'sample string 3',
    RMAItemList: [
      {
        CatalogID: 1,
        SKU: 'sample string 1',
        ItemName: 'sample string 2',
        ReturnQuantity: 1,
        ReceivedQuantity: 1,
        RestockQuantity: 1,
      },
      {
        CatalogID: 1,
        SKU: 'sample string 1',
        ItemName: 'sample string 2',
        ReturnQuantity: 1,
        ReceivedQuantity: 1,
        RestockQuantity: 1,
      },
    ],
  }
}

describe('transformRefund (Shift4Shop RMA)', () => {
  it('maps the documented example to a valid canonical Refund', () => {
    const raw = documentedRma()
    const out = RefundSchema.parse(transformRefund(raw))
    expect(out).toEqual({
      id: '1',
      orderId: '1',
      note: 'sample string 1',
      refundLineItems: [
        { lineItemId: '1', quantity: 1 },
        { lineItemId: '1', quantity: 1 },
      ],
      metadata: raw,
    })
  })

  it('reads the id from RMAID and the order from OrderID', () => {
    const out = RefundSchema.parse(
      transformRefund({ ...documentedRma(), RMAID: 77, OrderID: 1042 }),
    )
    expect(out.id).toBe('77')
    expect(out.orderId).toBe('1042')
  })

  // RMAItem.CatalogID is documented as "database reference = RMA_oitem.orderitemid",
  // the order item (the Order's ItemIndexID, "oitems.orderitemid").
  it('reads each line item id from CatalogID and its quantity from ReturnQuantity', () => {
    const raw = documentedRma()
    raw.RMAItemList = [
      { CatalogID: 5001, ReturnQuantity: 3, ReceivedQuantity: 1, RestockQuantity: 0 },
      { CatalogID: 5002, ReturnQuantity: 0, ReceivedQuantity: 0, RestockQuantity: 0 },
    ]
    const out = RefundSchema.parse(transformRefund(raw))
    expect(out.refundLineItems).toEqual([
      { lineItemId: '5001', quantity: 3 },
      { lineItemId: '5002', quantity: 0 },
    ])
  })

  // The RMA object documents no money field, no currency, no reason text (only
  // RMAReasonID) and a RmaDate with no time zone, so none of them is invented.
  it('invents no amount, currency, reason, restock flag or timestamps', () => {
    const out = RefundSchema.parse(transformRefund(documentedRma()))
    expect(out.amount).toBeUndefined()
    expect(out.reason).toBeUndefined()
    expect(out.restock).toBeUndefined()
    expect(out.createdAt).toBeUndefined()
    expect(out.processedAt).toBeUndefined()
    expect(out.refundLineItems?.every((li) => li.amount === undefined)).toBe(true)
    expect(out.metadata['RmaDate']).toBe('03/28/2019 17:28')
  })

  it('omits line items and the note when the RMA has none', () => {
    const raw = { ...documentedRma(), RMAItemList: [], Comments: '' }
    const out = RefundSchema.parse(transformRefund(raw))
    expect(out.refundLineItems).toBeUndefined()
    expect(out.note).toBeUndefined()
  })

  it('throws rather than inventing an id or an order', () => {
    expect(() => transformRefund({ ...documentedRma(), RMAID: null })).toThrow(/RMAID/)
    expect(() => transformRefund({ ...documentedRma(), OrderID: undefined })).toThrow(/OrderID/)
  })

  it('throws rather than inventing a line item or quantity', () => {
    const noItemId = documentedRma()
    noItemId.RMAItemList = [{ ReturnQuantity: 1 }]
    expect(() => transformRefund(noItemId)).toThrow(/CatalogID/)
    const noQty = documentedRma()
    noQty.RMAItemList = [{ CatalogID: 9 }]
    expect(() => transformRefund(noQty)).toThrow(/ReturnQuantity/)
  })
})
