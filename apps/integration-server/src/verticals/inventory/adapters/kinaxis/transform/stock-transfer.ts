/**
 * Kinaxis Maestro Transfer → StockTransfer transform.
 *
 * Maestro exposes inter-site movements via the Transfer (or Shipment) table.
 * Key fields:
 *   id              — system UUID
 *   transferNumber  — user-visible reference
 *   fromSiteId      — source site (references Site.id)
 *   toSiteId        — destination site (references Site.id)
 *   status          — "Draft" | "InTransit" | "Received" | "Cancelled"
 *   lines           — array of TransferLine
 *     partId        — references Part.id
 *     quantity      — quantity shipped
 *     receivedQty   — quantity confirmed received
 *   shipDate        — ISO-8601 shipment date
 *   receiptDate     — ISO-8601 date fully received at destination
 */
import type { StockTransfer, StockTransferStatus } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

export interface RawKinaxisTransfer {
  id: string
  transferNumber?: string
  fromSiteId?: string
  toSiteId?: string
  status?: string
  lines?: Array<{
    partId: string
    quantity: number
    receivedQty?: number
  }>
  shipDate?: string
  receiptDate?: string
  [key: string]: unknown
}

function mapStatus(s: string | undefined): StockTransferStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'draft': return 'draft'
    case 'intransit': case 'in_transit': case 'in transit': case 'shipped': return 'in_transit'
    case 'received': case 'completed': return 'completed'
    case 'cancelled': case 'voided': return 'cancelled'
    default: return 'draft'
  }
}

export function transformStockTransfer(raw: RawKinaxisTransfer): StockTransfer {
  return {
    id: raw.id,
    externalId: raw.id,
    number: pickStr(raw.transferNumber),
    fromLocationId: raw.fromSiteId ?? '',
    toLocationId: raw.toSiteId ?? '',
    status: mapStatus(raw.status),
    lines: (raw.lines ?? []).map((l) => ({
      productId: l.partId,
      quantity: l.quantity,
      quantityReceived: l.receivedQty,
    })),
    shippedAt: toIso(raw.shipDate),
    receivedAt: toIso(raw.receiptDate),
    platform: 'kinaxis',
    metadata: strMap({ status: raw.status }),
    raw,
  }
}
