/**
 * Transform a raw Xentral purchase order to the canonical PurchaseOrder schema.
 *
 * Source: GET /api/v1/purchaseOrders  /  GET /api/v1/purchaseOrders/{id}
 *
 * Key field mappings:
 *   id                               → id / externalId
 *   documentNumber                   → number
 *   supplier.id                      → supplierId
 *   status                           → status (mapped)
 *   financials.total.{amount,currency} → totalAmount (minor units), currency
 *   positions[n].product.id          → lines[n].productId
 *   positions[n].quantity            → lines[n].quantityOrdered
 *   positions[n].delivered           → lines[n].quantityReceived
 *   positions[n].price.amount        → lines[n].unitCost (minor units)
 *   date                             → orderedAt
 *   delivery.dates.desiredDeliveryDate → expectedAt
 *   delivery.dates.confirmedDeliveryDate → receivedAt (proxy for completion)
 *   log.createdAt                    → orderedAt (fallback)
 *
 * Xentral status values (from OpenAPI enum):
 *   "open", "partiallyDelivered", "delivered", "cancelled", "draft"
 */
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema'
import {pickStr, strMap, toIso, amountToMinorUnits} from './shared'

interface XentralMoney {
  amount?: string | number
  currency?: string
}

interface XentralPOPosition {
  id?: string
  product?: { id?: string }
  name?: string
  quantity?: number
  delivered?: number
  price?: XentralMoney
}

export interface RawXentralPurchaseOrder {
  id: string
  documentNumber?: string
  date?: string
  status?: string
  supplier?: {
    id?: string
    name?: string
    number?: string
  }
  financials?: {
    total?: XentralMoney
    tax?: { taxation?: string }
  }
  delivery?: {
    dates?: {
      desiredDeliveryDate?: string
      confirmedDeliveryDate?: string
    }
  }
  positions?: XentralPOPosition[]
  log?: {
    createdAt?: string
    isSent?: boolean
    sentAt?: string
  }
  internalDesignation?: string
  [key: string]: unknown
}

function mapStatus(s: string | undefined): PurchaseOrderStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'draft': return 'draft'
    case 'open': return 'sent'
    case 'partiallydelivered': case 'partially_delivered': return 'partially_received'
    case 'delivered': return 'received'
    case 'completed': case 'closed': return 'closed'
    case 'cancelled': case 'canceled': case 'voided': return 'cancelled'
    default: return 'draft'
  }
}

export function transformPurchaseOrder(raw: RawXentralPurchaseOrder): PurchaseOrder {
  const totalObj = raw.financials?.total
  const totalAmount =
    totalObj?.amount !== undefined
      ? amountToMinorUnits(totalObj.amount)
      : undefined
  const currency = pickStr(totalObj?.currency) ?? 'EUR'

  const lines = (raw.positions ?? []).map((pos) => ({
    productId: pos.product?.id ?? '',
    quantityOrdered: pos.quantity ?? 0,
    quantityReceived: pos.delivered !== undefined ? pos.delivered : undefined,
    unitCost:
      pos.price?.amount !== undefined
        ? amountToMinorUnits(pos.price.amount)
        : undefined,
  }))

  return {
    id: raw.id,
    externalId: raw.id,
    number: pickStr(raw.documentNumber),
    supplierId: raw.supplier?.id ?? '',
    status: mapStatus(raw.status),
    currency,
    totalAmount,
    lines,
    orderedAt: toIso(raw.date) ?? toIso(raw.log?.createdAt),
    expectedAt: toIso(raw.delivery?.dates?.desiredDeliveryDate),
    receivedAt: toIso(raw.delivery?.dates?.confirmedDeliveryDate),
    platform: 'xentral',
    metadata: strMap({
      supplierName: raw.supplier?.name,
      internalDesignation: raw.internalDesignation,
      isSent: raw.log?.isSent,
    }),
    raw,
  }
}
