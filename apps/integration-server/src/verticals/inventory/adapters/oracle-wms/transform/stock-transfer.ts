/**
 * Oracle WMS Cloud — transfer_order_hdr entity → StockTransfer
 *
 * lgfapi endpoint: GET /wms/lgfapi/v10/entity/transfer_order_hdr/
 *
 * Transfer orders in Oracle WMS Cloud represent movement of inventory
 * between locations (intra-facility) or between facilities.
 *
 * Key fields (header):
 *   to_hdr_id            — internal integer PK
 *   transfer_num         — human-readable transfer order number
 *   from_location_id     — source location FK
 *   to_location_id       — destination location FK
 *   from_facility_id     — source facility FK (for inter-facility transfers)
 *   to_facility_id       — destination facility FK
 *   status               — "Open", "In Transit", "Completed", "Cancelled"
 *   ship_date            — date/time shipped
 *   complete_date        — date/time completed/received
 *   company_id           — tenant FK
 *
 * Line item fields (transfer_order_dtl_set):
 *   to_dtl_id            — line PK
 *   item_id              — FK to item
 *   qty_transferred      — quantity in this transfer
 *   qty_received         — quantity received at destination
 */
import type { StockTransfer, StockTransferStatus } from '../../../schema'
import {pickStr, pickNum, strMap, toIso} from './shared'

export interface RawOracleWmsTransferLine {
  to_dtl_id?: number | string
  item_id?: number | string
  qty_transferred?: number | string
  qty_received?: number | string
  [key: string]: unknown
}

export interface RawOracleWmsTransferOrderHdr {
  to_hdr_id: number | string
  transfer_num?: string
  from_location_id?: number | string
  to_location_id?: number | string
  from_facility_id?: number | string
  to_facility_id?: number | string
  status?: string
  ship_date?: string
  complete_date?: string
  company_id?: number | string
  transfer_order_dtl_set?: RawOracleWmsTransferLine[]
  [key: string]: unknown
}

function mapStatus(s: string | undefined): StockTransferStatus {
  const u = (s ?? '').toUpperCase()
  if (u === 'OPEN' || u === 'NEW' || u === 'DRAFT' || u === 'PENDING') return 'draft'
  if (u === 'IN TRANSIT' || u === 'IN_TRANSIT' || u === 'SHIPPED' || u === 'PICKING') return 'in_transit'
  if (u === 'COMPLETED' || u === 'RECEIVED' || u === 'CLOSED') return 'completed'
  if (u === 'CANCELLED' || u === 'CANCELED' || u === 'VOIDED') return 'cancelled'
  return 'draft'
}

export function transformStockTransfer(raw: RawOracleWmsTransferOrderHdr): StockTransfer {
  const id = String(raw.to_hdr_id)

  // Prefer location IDs; fall back to facility IDs for inter-facility transfers
  const fromLocationId = raw.from_location_id !== undefined
    ? String(raw.from_location_id)
    : raw.from_facility_id !== undefined
      ? String(raw.from_facility_id)
      : ''
  const toLocationId = raw.to_location_id !== undefined
    ? String(raw.to_location_id)
    : raw.to_facility_id !== undefined
      ? String(raw.to_facility_id)
      : ''

  return {
    id,
    externalId: id,
    number: pickStr(raw.transfer_num),
    fromLocationId,
    toLocationId,
    status: mapStatus(raw.status),
    lines: (raw.transfer_order_dtl_set ?? []).map((l) => ({
      productId: l.item_id !== undefined ? String(l.item_id) : '',
      quantity: pickNum(l.qty_transferred) ?? 0,
      quantityReceived: pickNum(l.qty_received),
    })),
    shippedAt: toIso(raw.ship_date),
    receivedAt: toIso(raw.complete_date),
    platform: 'oracle-wms',
    metadata: strMap({
      status: raw.status,
      companyId: raw.company_id,
      fromFacilityId: raw.from_facility_id,
      toFacilityId: raw.to_facility_id,
    }),
    raw,
  }
}
