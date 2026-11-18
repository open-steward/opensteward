import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema'
import {strMap, toIso} from './shared'

/**
 * Raw purchase order object from GET /purchaseorders or GET /purchaseorders/{idpurchaseorder}.
 *
 * Field reference: https://picqer.com/en/api/purchaseorders
 * Status values: concept, purchased, received, cancelled.
 * Line item price is a float (excl. VAT).
 */
export interface RawPicqerPurchaseOrder {
  idpurchaseorder: number
  purchaseorderid?: number
  idsupplier?: number
  supplier_name?: string
  supplier_orderid?: string
  idwarehouse?: number
  status: string
  remarks?: string
  delivery_date?: string
  language?: string
  created?: string
  updated?: string
  products?: Array<{
    idproduct: number
    idpurchaseorder_product?: number
    amount: number
    amountreceived?: number
    price?: number
    productcode?: string
    name?: string
    delivery_date?: string
  }>
  [key: string]: unknown
}

function mapStatus(s: string | undefined): PurchaseOrderStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'concept': return 'draft'
    case 'purchased': return 'sent'
    case 'received': return 'received'
    case 'cancelled': return 'cancelled'
    default: return 'draft'
  }
}

export function transformPurchaseOrder(raw: RawPicqerPurchaseOrder): PurchaseOrder {
  const idStr = String(raw.idpurchaseorder)
  return {
    id: idStr,
    externalId: idStr,
    supplierId: raw.idsupplier ? String(raw.idsupplier) : '',
    destinationLocationId: raw.idwarehouse ? String(raw.idwarehouse) : undefined,
    status: mapStatus(raw.status),
    lines: (raw.products ?? []).map((l) => ({
      productId: String(l.idproduct),
      quantityOrdered: l.amount,
      quantityReceived: l.amountreceived,
      unitCost: l.price,
    })),
    expectedAt: toIso(raw.delivery_date),
    orderedAt: toIso(raw.created),
    platform: 'picqer',
    metadata: strMap({
      supplier_name: raw.supplier_name,
      supplier_orderid: raw.supplier_orderid,
      remarks: raw.remarks,
    }),
    raw,
  }
}
