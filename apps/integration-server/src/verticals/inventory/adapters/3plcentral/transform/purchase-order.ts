/**
 * Transform a 3PL Central receiver record (from GET /inventory/receivers or
 * GET /inventory/receivers/{receiverId}) into a canonical PurchaseOrder.
 *
 * In 3PL Central a "receiver" is the inbound receipt that corresponds to a PO.
 * The HAL response shape (camelCase):
 *   receiverId, referenceNum (PO number), customerIdentifier, facilityIdentifier,
 *   supplierIdentifier, statusIdentifier.{name,id},
 *   receivedDate, expectedDate,
 *   lineItems: Array<{ receiveItemId, itemIdentifier, qty, cost, ... }>
 */
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

interface ReceiverLineItem {
  receiveItemId?: number
  itemIdentifier?: { sku?: string; id?: number }
  qty?: number
  receivedQty?: number
  cost?: number
  [key: string]: unknown
}

export interface Raw3plCentralReceiver {
  receiverId?: number
  /** PO / reference number */
  referenceNum?: string
  poNum?: string
  trailerNumber?: string
  statusIdentifier?: { name?: string; id?: number }
  customerIdentifier?: { externalId?: string; name?: string; id?: number }
  facilityIdentifier?: { name?: string; id?: number }
  supplierIdentifier?: { name?: string; id?: number }
  receivedDate?: string
  expectedDate?: string
  lineItems?: ReceiverLineItem[]
  /** Embedded line items in some response shapes */
  _embedded?: { 'http://api.3plCentral.com/rels/receivers/receiverlineitem'?: ReceiverLineItem[] }
  [key: string]: unknown
}

function mapStatus(s: string | undefined): PurchaseOrderStatus {
  switch ((s ?? '').toLowerCase().replace(/\s+/g, '_')) {
    case 'draft': case 'new': case 'open': return 'draft'
    case 'in_transit': case 'sent': case 'submitted': return 'sent'
    case 'partially_received': case 'partial': return 'partially_received'
    case 'received': case 'complete': case 'completed': case 'closed': return 'received'
    case 'voided': case 'cancelled': case 'canceled': return 'cancelled'
    default: return 'draft'
  }
}

export function transformPurchaseOrder(raw: Raw3plCentralReceiver): PurchaseOrder {
  const id = String(raw.receiverId ?? '')

  // Line items may be inline or HAL-embedded
  const embedded = raw._embedded?.['http://api.3plCentral.com/rels/receivers/receiverlineitem'] ?? []
  const lines = (raw.lineItems ?? embedded).map((l) => ({
    productId: String(l.itemIdentifier?.id ?? ''),
    quantityOrdered: l.qty ?? 0,
    quantityReceived: l.receivedQty,
    unitCost: l.cost,
    lineTotal: l.cost !== undefined && l.qty !== undefined ? l.cost * l.qty : undefined,
  }))

  return {
    id,
    externalId: id,
    number: pickStr(raw.referenceNum ?? raw.poNum),
    supplierId: raw.supplierIdentifier?.id !== undefined ? String(raw.supplierIdentifier.id) : '',
    destinationLocationId: raw.facilityIdentifier?.id !== undefined ? `facility:${raw.facilityIdentifier.id}` : undefined,
    status: mapStatus(raw.statusIdentifier?.name),
    currency: undefined,
    subtotalAmount: undefined,
    totalAmount: undefined,
    lines,
    expectedAt: toIso(raw.expectedDate),
    orderedAt: undefined,
    receivedAt: toIso(raw.receivedDate),
    platform: '3plcentral',
    metadata: strMap({
      trailerNumber: raw.trailerNumber,
      facilityName: raw.facilityIdentifier?.name,
      supplierName: raw.supplierIdentifier?.name,
      customerId: raw.customerIdentifier?.id,
      customerName: raw.customerIdentifier?.name,
      statusId: raw.statusIdentifier?.id,
    }),
    raw,
  }
}
