/**
 * Transform a Peoplevox item-movement row representing a stock transfer.
 *
 * Peoplevox does not expose a dedicated "Stock Transfer" template.
 * Inter-site movements are captured in "Item movement history" which
 * records From/To locations. We synthesise a StockTransfer from movement rows
 * that have both a From and To site reference.
 *
 * Template: "Item movement history"
 * Key fields: History_Id, Item_code, Date_timestamp, From, To, Quantity,
 *   Site_reference, Comments
 */
import type { StockTransfer, StockTransferStatus } from '../../../schema'
import {pickStr, pickNum, strMap, toIso} from './shared'

export interface RawPeoplevoxItemMovement {
  History_Id?: string
  Item_code?: string
  Item_name?: string
  Date_timestamp?: string
  User?: string
  /** Source location name */
  From?: string
  /** Destination location name */
  To?: string
  Quantity?: string
  Comments?: string
  Site_reference?: string
  Register_Reason?: string
  [key: string]: unknown
}

function mapStatus(from: string | undefined, to: string | undefined): StockTransferStatus {
  if (from && to) return 'completed'
  return 'draft'
}

export function transformStockTransfer(raw: RawPeoplevoxItemMovement): StockTransfer {
  const id = pickStr(raw.History_Id) ?? `${raw.Item_code ?? ''}:${raw.Date_timestamp ?? ''}`
  return {
    id,
    externalId: id,
    number: pickStr(raw.History_Id),
    fromLocationId: pickStr(raw.From) ?? '',
    toLocationId: pickStr(raw.To) ?? '',
    status: mapStatus(raw.From, raw.To),
    lines: raw.Item_code ? [{
      productId: raw.Item_code,
      quantity: pickNum(raw.Quantity) ?? 0,
      quantityReceived: undefined,
    }] : [],
    shippedAt: toIso(raw.Date_timestamp),
    receivedAt: toIso(raw.Date_timestamp),
    platform: 'peoplevox',
    metadata: strMap({
      siteReference: raw.Site_reference,
      comments: raw.Comments,
      user: raw.User,
      registerReason: raw.Register_Reason,
    }),
    raw,
  }
}
