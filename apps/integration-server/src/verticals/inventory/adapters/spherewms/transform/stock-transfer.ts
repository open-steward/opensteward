import type { StockTransfer, StockTransferStatus } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

/**
 * Raw transfer history record from GET /transfer-history or GET /transfer-history/{id}.
 * SphereWMS pending transfers (GET /transfers) share the same shape.
 * Fields sourced from SphereWMS API v2.27.0.
 */
export interface RawSphereWmsTransfer {
  transfer_id?: string | number
  id?: string | number
  transfer_number?: string
  from_location_id?: string
  to_location_id?: string
  status?: string
  status_code?: string | number
  client_code?: string
  created_on?: string
  posted_on?: string
  shipped_on?: string
  completed_on?: string
  items?: Array<{
    product_id?: string | number
    product_code?: string
    quantity?: number
    received_qty?: number
    [key: string]: unknown
  }>
  [key: string]: unknown
}

function mapStatus(status: string | undefined): StockTransferStatus {
  const s = (status ?? '').toLowerCase()
  if (s.includes('cancel') || s.includes('void')) return 'cancelled'
  if (s.includes('complete') || s.includes('received') || s.includes('posted')) return 'completed'
  if (s.includes('transit') || s.includes('ship')) return 'in_transit'
  return 'draft'
}

export function transformStockTransfer(raw: RawSphereWmsTransfer): StockTransfer {
  const id = String(raw.transfer_id ?? raw.id ?? '')
  return {
    id,
    externalId: id,
    number: pickStr(raw.transfer_number),
    fromLocationId: raw.from_location_id ?? '',
    toLocationId: raw.to_location_id ?? '',
    status: mapStatus(raw.status),
    lines: (raw.items ?? []).map((item) => ({
      productId: String(item.product_id ?? item.product_code ?? ''),
      quantity: item.quantity ?? 0,
      quantityReceived: item.received_qty,
    })),
    shippedAt: toIso(raw.shipped_on),
    receivedAt: toIso(raw.completed_on ?? raw.posted_on),
    platform: 'spherewms',
    metadata: strMap({
      clientCode: raw.client_code,
      createdOn: raw.created_on,
      statusCode: raw.status_code,
    }),
    raw,
  }
}
