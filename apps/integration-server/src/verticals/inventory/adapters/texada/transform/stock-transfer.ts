/**
 * Transform Texada CloudLink inter-branch transfer records into the
 * canonical StockTransfer schema.
 *
 * Texada supports moving equipment between branches. The equivalent
 * document is sometimes called a "Branch Transfer" or "Equipment Transfer".
 */
import type { StockTransfer, StockTransferStatus } from '../../../schema'
import {pickStr, pickNum, strMap, toIso} from './shared'

export interface RawTexadaStockTransfer {
  /** Transfer internal identifier */
  transferId?: string
  id?: string
  /** Transfer document number */
  transferNo?: string
  number?: string
  /** Source and destination branches */
  fromBranchId?: string
  fromBranchNo?: string
  toBranchId?: string
  toBranchNo?: string
  /** Status */
  status?: string
  transferStatus?: string
  /** Line items */
  lines?: Array<{
    itemNo?: string
    productId?: string
    quantity?: number
    quantityTransferred?: number
    quantityReceived?: number
    received?: number
  }>
  /** Dates */
  shipDate?: string
  transferDate?: string
  receivedDate?: string
  completedDate?: string
  [key: string]: unknown
}

function mapStatus(s: string | undefined): StockTransferStatus {
  switch ((s ?? '').toUpperCase()) {
    case 'DRAFT': case 'PENDING': case 'NEW': return 'draft'
    case 'IN TRANSIT': case 'INTRANSIT': case 'SHIPPED': case 'SENT': return 'in_transit'
    case 'COMPLETED': case 'RECEIVED': case 'CLOSED': return 'completed'
    case 'VOIDED': case 'CANCELLED': case 'CANCELED': return 'cancelled'
    default: return 'draft'
  }
}

export function transformStockTransfer(raw: RawTexadaStockTransfer): StockTransfer {
  const id = pickStr(raw.transferId ?? raw.id) ?? ''
  const number = pickStr(raw.transferNo ?? raw.number)
  const fromLocationId = pickStr(raw.fromBranchId ?? raw.fromBranchNo) ?? ''
  const toLocationId = pickStr(raw.toBranchId ?? raw.toBranchNo) ?? ''
  const status = mapStatus(raw.status ?? raw.transferStatus)

  const lines = (raw.lines ?? []).map((l) => ({
    productId: pickStr(l.itemNo ?? l.productId) ?? '',
    quantity: pickNum(l.quantity ?? l.quantityTransferred) ?? 0,
    quantityReceived: pickNum(l.quantityReceived ?? l.received),
  }))

  return {
    id,
    externalId: id,
    number,
    fromLocationId,
    toLocationId,
    status,
    lines,
    shippedAt: toIso(raw.shipDate ?? raw.transferDate),
    receivedAt: toIso(raw.receivedDate ?? raw.completedDate),
    platform: 'texada',
    metadata: strMap({}),
    raw,
  }
}
