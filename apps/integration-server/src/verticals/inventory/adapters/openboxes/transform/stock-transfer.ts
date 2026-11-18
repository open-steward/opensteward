import type { StockTransfer, StockTransferStatus } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

/**
 * OpenBoxes internal transfer (stock movement with both origin+destination
 * as internal locations) returned from:
 *   GET /openboxes/api/stockMovements?direction=OUTBOUND
 *   GET /openboxes/api/stockMovements/:id
 *
 * Response envelope: { data: RawOpenboxesStockTransfer | RawOpenboxesStockTransfer[] }
 */
export interface RawOpenboxesStockTransfer {
  id: string
  identifier?: string | null
  name?: string | null
  status?: string | null
  statusCode?: string | null
  origin?: { id?: string; name?: string } | null
  destination?: { id?: string; name?: string } | null
  dateShipped?: string | null
  dateDelivered?: string | null
  lineItems?: Array<{
    id?: string
    product?: { id?: string; productCode?: string; name?: string }
    quantityRequested?: number
    quantityAllowed?: number
    statusCode?: string
  }> | null
  [key: string]: unknown
}

function mapStatus(s: string | null | undefined): StockTransferStatus {
  switch ((s ?? '').toUpperCase()) {
    case 'CREATED':
    case 'REQUESTED':
    case 'APPROVED':
    case 'VERIFYING':
    case 'PICKING':
    case 'PACKED':
      return 'draft'
    case 'SHIPPED':
    case 'PARTIALLY_RECEIVED':
      return 'in_transit'
    case 'RECEIVED':
    case 'DELIVERED':
    case 'COMPLETED':
      return 'completed'
    case 'CANCELLED':
    case 'DELETED':
      return 'cancelled'
    default:
      return 'draft'
  }
}

export function transformStockTransfer(raw: RawOpenboxesStockTransfer): StockTransfer {
  const lines = (raw.lineItems ?? []).map((l) => ({
    productId: l.product?.id ?? '',
    quantity: l.quantityRequested ?? 0,
    quantityReceived: l.quantityAllowed,
  }))

  return {
    id: raw.id,
    externalId: raw.id,
    number: pickStr(raw.identifier) ?? pickStr(raw.name),
    fromLocationId: raw.origin?.id ?? '',
    toLocationId: raw.destination?.id ?? '',
    status: mapStatus(raw.statusCode ?? raw.status),
    lines,
    shippedAt: toIso(raw.dateShipped),
    receivedAt: toIso(raw.dateDelivered),
    platform: 'openboxes',
    metadata: strMap({}),
    raw,
  }
}
