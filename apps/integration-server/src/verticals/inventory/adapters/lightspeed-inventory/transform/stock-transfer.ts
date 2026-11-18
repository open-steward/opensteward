/**
 * Lightspeed Retail (X-Series) stock transfer transform.
 *
 * X-Series inter-outlet transfers are consignments with type=OUTLET.
 * The source outlet is source_outlet_id; the destination is outlet_id.
 * Status flow: OPEN → SENT → RECEIVED (or CANCELLED).
 *
 * API endpoint: GET /api/2.0/consignments?type=OUTLET
 */
import type { StockTransfer, StockTransferStatus } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'
import type { RawLightspeedConsignment, RawLightspeedConsignmentLine } from './purchase-order'

export type { RawLightspeedConsignment as RawLightspeedStockTransfer }

function mapStatus(s: string | undefined): StockTransferStatus {
  switch ((s ?? '').toUpperCase()) {
    case 'OPEN': return 'draft'
    case 'SENT': return 'in_transit'
    case 'RECEIVED': return 'completed'
    case 'CANCELLED': return 'cancelled'
    default: return 'draft'
  }
}

export function transformStockTransfer(raw: RawLightspeedConsignment): StockTransfer {
  return {
    id: raw.id,
    externalId: raw.id,
    number: pickStr(raw.name ?? raw.reference),
    fromLocationId: raw.source_outlet_id ?? '',
    toLocationId: raw.outlet_id ?? '',
    status: mapStatus(raw.status),
    lines: (raw.products ?? [] as RawLightspeedConsignmentLine[]).map((l) => ({
      productId: l.product_id,
      quantity: typeof l.count === 'number' ? l.count : Number(l.count ?? 0),
      quantityReceived: l.received !== undefined
        ? (typeof l.received === 'number' ? l.received : Number(l.received))
        : undefined,
    })),
    shippedAt: toIso(raw.sent_at),
    receivedAt: toIso(raw.received_at),
    platform: 'lightspeed-inventory',
    metadata: strMap({ reference: raw.reference }),
    raw,
  }
}
