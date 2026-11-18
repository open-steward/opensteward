/**
 * Shift4Shop RMA → canonical Refund.
 *
 * Shift4Shop documents no refund or "Returns" resource. Returns are RMAs
 * (https://apirest.3dcart.com/v1/rma/index.html): "The RMA (Return
 * Merchandise Authorization) methods allow you to retrieve RMA information."
 * Read from `GET /RMA` and `GET /RMA/{rmaid}`.
 *
 * Fields, from the RMA and RMAItem object definitions
 * (https://apirest.3dcart.com/v1/object-definitions/index.html):
 *   RMAID       integer  "Primary key. Auto-incremented."
 *   OrderID     integer  "database reference = RMA.orderid"
 *   Comments    string   "database reference = RMA.Comments"
 *   RMAItemList          "Collection of RMAItem objects"
 *   RMAItem.CatalogID      integer "database reference = RMA_oitem.orderitemid"
 *   RMAItem.ReturnQuantity integer "database reference = RMA_oitem.qty_return"
 *
 * The RMA documents no money field and no currency, so no amount is mapped.
 * The reason is only an id (RMAReasonID), and RmaDate ("03/28/2019 17:28")
 * carries no time zone, so neither becomes a canonical field; both stay in
 * `metadata`.
 */

import type { Refund, RefundLineItem } from '../../../schema/refund'

// ── Raw Shift4Shop shapes ────────────────────────────────────────────────────

export interface RawShift4ShopRMAItem {
  CatalogID?: number | null
  SKU?: string | null
  ItemName?: string | null
  ReturnQuantity?: number | null
  ReceivedQuantity?: number | null
  RestockQuantity?: number | null
}

export interface RawShift4ShopRMA {
  RMAID?: number | null
  RmaDate?: string | null
  OrderID?: number | null
  RMAReasonID?: number | null
  RMAMethodID?: number | null
  RMAStatusID?: number | null
  Comments?: string | null
  InternalComments?: string | null
  StaffComments?: string | null
  RMAItemList?: RawShift4ShopRMAItem[] | null
}

// ── Transform ────────────────────────────────────────────────────────────────

function mapItem(raw: RawShift4ShopRMAItem, rmaId: string): RefundLineItem {
  if (raw.CatalogID == null) {
    throw new Error(`Shift4Shop RMA ${rmaId} has an item without CatalogID (its order item id)`)
  }
  if (raw.ReturnQuantity == null) {
    throw new Error(`Shift4Shop RMA ${rmaId} item ${raw.CatalogID} has no ReturnQuantity`)
  }
  return { lineItemId: String(raw.CatalogID), quantity: raw.ReturnQuantity }
}

export function transformRefund(raw: RawShift4ShopRMA): Refund {
  if (raw.RMAID == null) throw new Error('Shift4Shop RMA has no RMAID')
  const id = String(raw.RMAID)
  if (raw.OrderID == null) throw new Error(`Shift4Shop RMA ${id} has no OrderID`)
  const items = (raw.RMAItemList ?? []).map((li) => mapItem(li, id))

  return {
    id,
    orderId: String(raw.OrderID),
    note: raw.Comments ? raw.Comments : undefined,
    refundLineItems: items.length > 0 ? items : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
