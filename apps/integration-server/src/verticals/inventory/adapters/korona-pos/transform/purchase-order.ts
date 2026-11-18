import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

/**
 * KORONA.cloud API v3 StockReceipt shape.
 * In KORONA, stock receipts serve as purchase orders / goods receipts.
 * Status enum: "BOOKED" | "IN_PROGRESS"
 * Items are fetched separately via GET /stockReceipts/{id}/stockReceiptItems.
 *
 * StockReceiptItemAmount fields: expected (ordered qty), received (received qty).
 * StockReceiptItemPurchasePrice fields: actual (current purchase price), old (previous).
 * Prices are stored as decimal currency units (e.g. 1.99 = $1.99).
 */
export interface RawKoronaPosStockReceipt {
  id: string
  number?: string
  active?: boolean
  status?: string
  supplier?: { id?: string; number?: string }
  organizationalUnit?: { id?: string; number?: string }
  sourceOrganizationalUnit?: { id?: string; number?: string }
  arrivalDate?: string
  bookingTime?: string
  createTime?: string
  description?: string
  itemsCount?: number
  items?: Array<{
    product?: { id?: string; number?: string }
    amount?: { expected?: number; received?: number }
    purchasePrice?: { actual?: number; old?: number }
    index?: number
  }>
  [key: string]: unknown
}

function mapStatus(s: string | undefined): PurchaseOrderStatus {
  switch ((s ?? '').toUpperCase()) {
    case 'BOOKED':
      return 'received'
    case 'IN_PROGRESS':
      return 'partially_received'
    default:
      return 'draft'
  }
}

export function transformPurchaseOrder(raw: RawKoronaPosStockReceipt): PurchaseOrder {
  const lines = (raw.items ?? []).map((item) => ({
    productId: item.product?.id ?? '',
    // amount.expected = ordered quantity; amount.received = received quantity
    quantityOrdered: item.amount?.expected ?? 0,
    quantityReceived: item.amount?.received,
    // purchasePrice.actual is in currency units (decimal) — convert to integer minor units
    unitCost:
      item.purchasePrice?.actual !== undefined
        ? Math.round(item.purchasePrice.actual * 100)
        : undefined,
    lineTotal: undefined,
  }))

  return {
    id: raw.id,
    externalId: raw.id,
    number: pickStr(raw.number),
    supplierId: raw.supplier?.id ?? '',
    destinationLocationId: pickStr(raw.organizationalUnit?.id),
    status: mapStatus(raw.status),
    currency: undefined,
    subtotalAmount: undefined,
    totalAmount: undefined,
    lines,
    expectedAt: toIso(raw.arrivalDate),
    orderedAt: toIso(raw.createTime),
    receivedAt: toIso(raw.bookingTime),
    platform: 'korona-pos',
    metadata: strMap({
      description: raw.description,
      itemsCount: raw.itemsCount,
      sourceOrganizationalUnit: raw.sourceOrganizationalUnit?.id,
    }),
    raw,
  }
}
