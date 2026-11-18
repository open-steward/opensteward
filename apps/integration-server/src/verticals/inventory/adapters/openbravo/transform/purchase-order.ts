/**
 * Openbravo Order (purchase transaction) → canonical PurchaseOrder.
 *
 * Entity: Order (table: C_Order)
 * Endpoint: /openbravo/org.openbravo.service.json.jsonrest/Order
 *            ?_where=salesTransaction='N'
 *
 * Openbravo uses a single Order entity for both sales and purchase orders;
 * salesTransaction='N' filters to purchase orders only.
 *
 * Status lifecycle in Openbravo:
 *   DR (Draft) → CO (Booked/Sent) → partial receipt → full receipt → CL (Closed)
 *   VO = Voided
 *
 * Fields used:
 *   id, documentNo, documentStatus, businessPartner.id, warehouse.id,
 *   currency._identifier, grandTotalAmt, sumLineNetAmt,
 *   orderDate, scheduledDeliveryDate, orderLineList
 */
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema'
import {pickStr, pickNum, strMap, toIso} from './shared'

export interface RawOpenbravoOrderLine {
  id: string
  product?: { id?: string }
  orderedQuantity?: number | string
  deliveredQuantity?: number | string
  /** Unit net price */
  unitPrice?: number | string
  lineNetAmt?: number | string
  [key: string]: unknown
}

export interface RawOpenbravoOrder {
  /** UUID primary key */
  id: string
  documentNo?: string
  /** DR=Draft, CO=Booked, CL=Closed, VO=Voided, partially-received handled via delivery */
  documentStatus?: string
  businessPartner?: { id?: string; _identifier?: string }
  warehouse?: { id?: string }
  currency?: { _identifier?: string }
  grandTotalAmt?: number | string
  sumLineNetAmt?: number | string
  orderDate?: string
  scheduledDeliveryDate?: string
  orderLineList?: RawOpenbravoOrderLine[]
  [key: string]: unknown
}

function mapStatus(s: string | undefined): PurchaseOrderStatus {
  switch ((s ?? '').toUpperCase()) {
    case 'DR':
      return 'draft'
    case 'CO':
      return 'sent'
    case 'IP':
      return 'partially_received'
    case 'CL':
      return 'closed'
    case 'VO':
      return 'cancelled'
    default:
      return 'draft'
  }
}

export function transformPurchaseOrder(raw: RawOpenbravoOrder): PurchaseOrder {
  return {
    id: raw.id,
    externalId: raw.id,
    number: pickStr(raw.documentNo),
    supplierId: raw.businessPartner?.id ?? '',
    destinationLocationId: raw.warehouse?.id,
    status: mapStatus(raw.documentStatus),
    currency: pickStr(raw.currency?._identifier),
    subtotalAmount: pickNum(raw.sumLineNetAmt),
    totalAmount: pickNum(raw.grandTotalAmt),
    lines: (raw.orderLineList ?? []).map((l) => ({
      productId: l.product?.id ?? '',
      quantityOrdered: pickNum(l.orderedQuantity) ?? 0,
      quantityReceived: pickNum(l.deliveredQuantity),
      unitCost: pickNum(l.unitPrice),
      lineTotal: pickNum(l.lineNetAmt),
    })),
    orderedAt: toIso(raw.orderDate),
    expectedAt: toIso(raw.scheduledDeliveryDate),
    platform: 'openbravo',
    metadata: strMap({ documentStatus: raw.documentStatus }),
    raw,
  }
}
