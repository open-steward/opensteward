import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

/**
 * OpenBoxes inbound stock movement (purchase/receive) returned from:
 *   GET /openboxes/api/stockMovements?direction=INBOUND
 *   GET /openboxes/api/stockMovements/:id
 *
 * Response envelope: { data: RawOpenboxesPurchaseOrder | RawOpenboxesPurchaseOrder[] }
 *
 * OpenBoxes does not have a dedicated Purchase Order entity — inbound
 * stock movements serve as the closest analogue.
 */
export interface RawOpenboxesPurchaseOrder {
  id: string
  identifier?: string | null
  name?: string | null
  description?: string | null
  status?: string | null
  statusCode?: string | null
  origin?: { id?: string; name?: string } | null
  destination?: { id?: string; name?: string } | null
  requestedBy?: { id?: string; name?: string } | null
  dateRequested?: string | null
  dateShipped?: string | null
  dateDelivered?: string | null
  lineItems?: Array<{
    id?: string
    product?: { id?: string; productCode?: string; name?: string }
    quantityRequested?: number
    quantityAllowed?: number
    quantityAvailable?: number
    quantityCanceled?: number
    statusCode?: string
  }> | null
  [key: string]: unknown
}

function mapStatus(s: string | null | undefined): PurchaseOrderStatus {
  switch ((s ?? '').toUpperCase()) {
    case 'CREATED':
    case 'REQUESTED':
      return 'draft'
    case 'APPROVED':
    case 'VERIFYING':
    case 'PICKING':
    case 'PACKED':
      return 'sent'
    case 'PARTIALLY_RECEIVED':
      return 'partially_received'
    case 'RECEIVED':
    case 'DELIVERED':
      return 'received'
    case 'COMPLETED':
      return 'closed'
    case 'CANCELLED':
    case 'DELETED':
      return 'cancelled'
    default:
      return 'draft'
  }
}

export function transformPurchaseOrder(raw: RawOpenboxesPurchaseOrder): PurchaseOrder {
  const lines = (raw.lineItems ?? []).map((l) => ({
    productId: l.product?.id ?? '',
    quantityOrdered: l.quantityRequested ?? 0,
    quantityReceived: l.quantityAllowed,
  }))

  return {
    id: raw.id,
    externalId: raw.id,
    number: pickStr(raw.identifier) ?? pickStr(raw.name),
    supplierId: raw.origin?.id ?? '',
    destinationLocationId: pickStr(raw.destination?.id),
    status: mapStatus(raw.statusCode ?? raw.status),
    lines,
    expectedAt: toIso(raw.dateShipped),
    orderedAt: toIso(raw.dateRequested),
    receivedAt: toIso(raw.dateDelivered),
    platform: 'openboxes',
    metadata: strMap({ description: raw.description, requestedBy: raw.requestedBy?.name }),
    raw,
  }
}
