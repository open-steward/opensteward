import type { StockTransfer, StockTransferStatus } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

/**
 * KORONA.cloud API v3 — stock transfers are modelled as StockReceipts that
 * have a `sourceOrganizationalUnit` (the "from" location) in addition to
 * the destination `organizationalUnit`.
 * Status enum: "BOOKED" | "IN_PROGRESS"
 */
export interface RawKoronaPosStockTransfer {
  id: string
  number?: string
  active?: boolean
  status?: string
  organizationalUnit?: { id?: string; number?: string }
  sourceOrganizationalUnit?: { id?: string; number?: string }
  arrivalDate?: string
  bookingTime?: string
  createTime?: string
  description?: string
  items?: Array<{
    product?: { id?: string; number?: string }
    /** StockReceiptItemAmount: expected = ordered/sent qty, received = received qty */
    amount?: { expected?: number; received?: number }
    index?: number
  }>
  [key: string]: unknown
}

function mapStatus(s: string | undefined): StockTransferStatus {
  switch ((s ?? '').toUpperCase()) {
    case 'BOOKED':
      return 'completed'
    case 'IN_PROGRESS':
      return 'in_transit'
    default:
      return 'draft'
  }
}

export function transformStockTransfer(raw: RawKoronaPosStockTransfer): StockTransfer {
  const lines = (raw.items ?? []).map((item) => ({
    productId: item.product?.id ?? '',
    // amount.expected = shipped/sent quantity; amount.received = confirmed received
    quantity: item.amount?.expected ?? 0,
    quantityReceived: item.amount?.received,
  }))

  return {
    id: raw.id,
    externalId: raw.id,
    number: pickStr(raw.number),
    fromLocationId: raw.sourceOrganizationalUnit?.id ?? '',
    toLocationId: raw.organizationalUnit?.id ?? '',
    status: mapStatus(raw.status),
    lines,
    shippedAt: toIso(raw.createTime),
    receivedAt: toIso(raw.bookingTime ?? raw.arrivalDate),
    platform: 'korona-pos',
    metadata: strMap({
      description: raw.description,
      sourceOrgUnitNumber: raw.sourceOrganizationalUnit?.number,
      destOrgUnitNumber: raw.organizationalUnit?.number,
    }),
    raw,
  }
}
