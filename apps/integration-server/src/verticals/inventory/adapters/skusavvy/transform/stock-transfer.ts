import type { StockTransfer, StockTransferStatus } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

/**
 * SKUSavvy GraphQL bin replenishment / stock transfer node.
 * Represents movement of inventory between locations or bins.
 */
export interface RawSkusavvyStockTransfer {
  id: string
  transferNumber?: string
  fromLocationId?: string
  toLocationId?: string
  status?: string
  lineItems?: Array<{ productId: string; quantity: number; quantityReceived?: number }>
  shippedAt?: string
  completedAt?: string
  [key: string]: unknown
}

function mapStatus(s: string | undefined): StockTransferStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'draft': case 'pending': return 'draft'
    case 'in_transit': case 'in transit': case 'shipped': return 'in_transit'
    case 'completed': case 'received': return 'completed'
    case 'cancelled': case 'canceled': case 'voided': return 'cancelled'
    default: return 'draft'
  }
}

export function transformStockTransfer(raw: RawSkusavvyStockTransfer): StockTransfer {
  return {
    id: raw.id,
    externalId: raw.id,
    number: pickStr(raw.transferNumber),
    fromLocationId: raw.fromLocationId ?? '',
    toLocationId: raw.toLocationId ?? '',
    status: mapStatus(raw.status),
    lines: (raw.lineItems ?? []).map((l) => ({
      productId: l.productId,
      quantity: l.quantity,
      quantityReceived: l.quantityReceived,
    })),
    shippedAt: toIso(raw.shippedAt),
    receivedAt: toIso(raw.completedAt),
    platform: 'skusavvy',
    metadata: strMap({ status: raw.status }),
    raw,
  }
}
