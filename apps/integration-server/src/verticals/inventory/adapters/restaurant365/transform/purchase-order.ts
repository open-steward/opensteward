/**
 * Transform Restaurant365 OData `Transaction` (type="AP Invoice" or "Purchase Order")
 * + its TransactionDetail lines -> canonical PurchaseOrder.
 *
 * R365 surfaces purchasing activity through Transactions. The R365 REST write
 * API (/APIv1/APInvoices) is write-only; reading back happens via OData
 * Transactions with type="AP Invoice".
 *
 * OData fields used:
 * Transaction:
 *   transactionId     Guid
 *   transactionNumber String
 *   name              String
 *   type              String   — "AP Invoice" | "Purchase Order"
 *   locationId        Guid     — destination location
 *   companyId         Guid     — vendor / supplier
 *   date              DateTimeOffset — ordered/issued date
 *   isApproved        Boolean
 *   createdBy         String
 *
 * TransactionDetail (lines):
 *   transactionDetailId  Guid
 *   itemId               Guid
 *   quantity             Decimal
 *   debit                Decimal — line amount (cost side)
 *   credit               Decimal
 *   unitOfMeasureName    String
 *   comment              String
 */
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

export interface RawR365POLine {
  transactionDetailId?: string
  itemId?: string
  quantity?: number
  debit?: number
  credit?: number
  unitOfMeasureName?: string
  comment?: string
  [key: string]: unknown
}

export interface RawR365PurchaseTransaction {
  transactionId: string
  transactionNumber?: string
  name?: string
  type?: string
  locationId?: string
  companyId?: string
  date?: string
  isApproved?: boolean
  createdBy?: string
  lines?: RawR365POLine[]
  [key: string]: unknown
}

function mapStatus(isApproved: boolean | undefined, type: string | undefined): PurchaseOrderStatus {
  const t = (type ?? '').toLowerCase()
  if (t.includes('invoice') && isApproved === true) return 'closed'
  if (t.includes('invoice') && isApproved === false) return 'partially_received'
  if (isApproved === true) return 'received'
  if (isApproved === false) return 'sent'
  return 'draft'
}

export function transformPurchaseOrder(raw: RawR365PurchaseTransaction): PurchaseOrder {
  let totalAmount = 0
  const lines = (raw.lines ?? []).map((l) => {
    const unitCost = l.debit ?? l.credit ?? 0
    const qty = l.quantity ?? 0
    const lineTotal = unitCost * qty
    totalAmount += lineTotal
    return {
      productId: l.itemId ?? '',
      quantityOrdered: qty,
      quantityReceived: undefined,
      unitCost,
      lineTotal,
    }
  })

  return {
    id: raw.transactionId,
    externalId: raw.transactionId,
    number: pickStr(raw.transactionNumber),
    supplierId: raw.companyId ?? '',
    destinationLocationId: pickStr(raw.locationId),
    status: mapStatus(raw.isApproved, raw.type),
    currency: 'USD',
    subtotalAmount: totalAmount,
    totalAmount,
    lines,
    expectedAt: undefined,
    orderedAt: toIso(raw.date),
    receivedAt: raw.isApproved ? toIso(raw.date) : undefined,
    platform: 'restaurant365',
    metadata: strMap({
      transactionNumber: raw.transactionNumber,
      name: raw.name,
      type: raw.type,
      createdBy: raw.createdBy,
    }),
    raw,
  }
}
