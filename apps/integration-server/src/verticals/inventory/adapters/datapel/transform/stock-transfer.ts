/**
 * Transform a Datapel Breeze transfer-order record into the canonical
 * StockTransfer shape.
 *
 * Datapel surfaces transfers via the /transferorderlist endpoint.
 * Field mapping follows the ccBreezeSDK naming conventions (lowercase).
 *
 * Status values observed:
 *   'Open', 'Draft', 'In Transit', 'Received', 'Completed', 'Cancelled'
 */
import type { StockTransfer, StockTransferStatus } from '../../../schema'
import {pickStr, pickNum, strMap, toIso} from './shared'

export interface RawDatapelTransferOrder {
  transferid?: number | string
  transfernumber?: string
  fromlocationid?: number | string
  tolocationid?: number | string
  fromlocationname?: string
  tolocationname?: string
  status?: string
  shipdate?: string
  receiveddate?: string
  completeddate?: string
  lines?: Array<{
    basestockid?: number | string
    itemcode?: string
    qty?: number | string
    transferqty?: number | string
    receivedqty?: number | string
  }>
  [key: string]: unknown
}

function mapStatus(s: string | undefined): StockTransferStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'draft':
    case 'open':
    case 'pending':
      return 'draft'
    case 'in transit':
    case 'intransit':
    case 'shipped':
      return 'in_transit'
    case 'received':
    case 'completed':
      return 'completed'
    case 'cancelled':
    case 'voided':
      return 'cancelled'
    default:
      return 'draft'
  }
}

export function transformStockTransfer(raw: RawDatapelTransferOrder): StockTransfer {
  const id = String(raw.transferid ?? '')
  return {
    id,
    externalId: id,
    number: pickStr(raw.transfernumber),
    fromLocationId: String(raw.fromlocationid ?? ''),
    toLocationId: String(raw.tolocationid ?? ''),
    status: mapStatus(raw.status),
    lines: (raw.lines ?? []).map((l) => ({
      productId: String(l.basestockid ?? ''),
      quantity: pickNum(l.qty) ?? pickNum(l.transferqty) ?? 0,
      quantityReceived: pickNum(l.receivedqty),
    })),
    shippedAt: toIso(raw.shipdate),
    receivedAt: toIso(raw.receiveddate) ?? toIso(raw.completeddate),
    platform: 'datapel',
    metadata: strMap({
      fromlocationname: raw.fromlocationname,
      tolocationname: raw.tolocationname,
      status: raw.status,
    }),
    raw,
  }
}
