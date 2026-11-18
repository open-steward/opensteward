/**
 * Transform a Peoplevox "Purchase order" GetData CSV row into a canonical PurchaseOrder.
 *
 * Template: "Purchase order"
 * Key header fields: PurchaseOrderNumber, Status, Reference, Supplier,
 *   AddressLine1, AddressLine2, AddressCity, AddressRegion,
 *   AddressPostcode, AddressCountry, RequestedDeliveryDate,
 *   SubmittedDate, ExpectedDeliveryDate, EndDate, User
 *
 * Line-level fields (per-item rows, same template):
 *   PurchaseOrderNumber, ItemCode, Status, Quantity,
 *   RequestedDeliveryDate, CostPrice, ExpectedDeliveryDate
 *
 * Because the Peoplevox CSV is flat, a row may be a header or a line row.
 * The adapter fetches the header template and line template separately and
 * merges them; here we handle header rows with optional pre-aggregated lines.
 */
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema'
import {pickStr, pickNum, strMap, toIso} from './shared'

export interface RawPeoplevoxPurchaseOrder {
  PurchaseOrderNumber: string
  Status?: string
  Reference?: string
  /** Supplier name (Peoplevox stores name, not ID in default template) */
  Supplier?: string
  AddressLine1?: string
  AddressLine2?: string
  AddressCity?: string
  AddressRegion?: string
  AddressPostcode?: string
  AddressCountry?: string
  RequestedDeliveryDate?: string
  SubmittedDate?: string
  ExpectedDeliveryDate?: string
  EndDate?: string
  User?: string
  /** Pre-aggregated line items (populated by the adapter when merging) */
  Lines?: RawPeoplevoxPurchaseOrderLine[]
  [key: string]: unknown
}

export interface RawPeoplevoxPurchaseOrderLine {
  PurchaseOrderNumber?: string
  ItemCode?: string
  Status?: string
  Quantity?: string
  CostPrice?: string
  RequestedDeliveryDate?: string
  ExpectedDeliveryDate?: string
  [key: string]: unknown
}

function mapStatus(s: string | undefined): PurchaseOrderStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'draft': case 'new': return 'draft'
    case 'submitted': case 'approved': case 'ordered': return 'sent'
    case 'partial': case 'partially received': return 'partially_received'
    case 'received': case 'complete': case 'completed': return 'received'
    case 'closed': return 'closed'
    case 'cancelled': case 'canceled': case 'voided': return 'cancelled'
    default: return 'draft'
  }
}

export function transformPurchaseOrder(raw: RawPeoplevoxPurchaseOrder): PurchaseOrder {
  return {
    id: raw.PurchaseOrderNumber,
    externalId: raw.PurchaseOrderNumber,
    number: pickStr(raw.PurchaseOrderNumber),
    supplierId: pickStr(raw.Supplier) ?? '',
    destinationLocationId: undefined,
    status: mapStatus(raw.Status),
    currency: undefined,
    subtotalAmount: undefined,
    totalAmount: undefined,
    lines: (raw.Lines ?? []).map((l) => {
      const unitCostDecimal = pickNum(l.CostPrice)
      return {
        productId: l.ItemCode ?? '',
        quantityOrdered: pickNum(l.Quantity) ?? 0,
        quantityReceived: undefined,
        // Amounts in integer minor units (pence/cents)
        unitCost: unitCostDecimal !== undefined ? Math.round(unitCostDecimal * 100) : undefined,
        lineTotal: undefined,
      }
    }),
    expectedAt: toIso(raw.ExpectedDeliveryDate) ?? toIso(raw.RequestedDeliveryDate),
    orderedAt: toIso(raw.SubmittedDate),
    receivedAt: toIso(raw.EndDate),
    platform: 'peoplevox',
    metadata: strMap({
      reference: raw.Reference,
      user: raw.User,
      addressCity: raw.AddressCity,
      addressCountry: raw.AddressCountry,
    }),
    raw,
  }
}
