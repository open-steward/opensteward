/**
 * Transform Wasp InventoryCloud purchase order → canonical PurchaseOrder.
 *
 * InventoryCloud purchase order fields (from ic/purchaseorder endpoints):
 *   OrderNumber       — PO number / string identifier
 *   VendorNumber      — vendor/supplier identifier
 *   SiteName          — destination site/warehouse
 *   Status            — "Draft-OK", "Open-PoOpenIssued", "Closed-ReceiverCancel",
 *                        "Closed-VendorCancel", "Closed-PoReceived"
 *   OrderDate         — date the PO was placed
 *   ExpectedDate      — expected delivery date
 *   ReceivedDate      — date fully received
 *   Lines[]           — line items
 *     ItemNumber      — item identifier
 *     Quantity        — ordered quantity
 *     QuantityReceived — received quantity
 *     UnitCost        — cost per unit (float)
 *
 * Amounts: unitCost / lineTotal stored as floats (not transaction amounts).
 * No integer minor-unit conversion needed — these are cost reference values.
 */
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema'
import {pickStr, pickNum, strMap, toIso} from './shared'

export interface RawWaspBarcodePOLine {
  ItemNumber?: string
  Quantity?: number | string
  QuantityReceived?: number | string
  UnitCost?: number | string
  [key: string]: unknown
}

export interface RawWaspBarcodePurchaseOrder {
  OrderNumber?: string
  VendorNumber?: string
  SiteName?: string
  Status?: string
  OrderDate?: string
  ExpectedDate?: string
  ReceivedDate?: string
  Lines?: RawWaspBarcodePOLine[]
  [key: string]: unknown
}

function mapStatus(s: string | undefined): PurchaseOrderStatus {
  const upper = (s ?? '').toUpperCase()
  if (upper === 'DRAFT-OK' || upper === 'DRAFT') return 'draft'
  if (upper === 'OPEN-POOPENISSUED' || upper === 'OPEN' || upper === 'ORDERED') return 'sent'
  if (upper.includes('PARTIAL')) return 'partially_received'
  if (upper === 'CLOSED-PORECEIVED' || upper === 'RECEIVED') return 'received'
  if (upper.includes('CLOSED')) return 'closed'
  if (upper.includes('CANCEL')) return 'cancelled'
  return 'draft'
}

export function transformPurchaseOrder(raw: RawWaspBarcodePurchaseOrder): PurchaseOrder {
  const id = pickStr(raw.OrderNumber) ?? ''
  const lines = (raw.Lines ?? []).map((l) => {
    const qty = pickNum(l.Quantity) ?? 0
    const unitCost = pickNum(l.UnitCost)
    return {
      productId: pickStr(l.ItemNumber) ?? '',
      quantityOrdered: qty,
      quantityReceived: pickNum(l.QuantityReceived),
      unitCost,
      lineTotal: unitCost !== undefined ? unitCost * qty : undefined,
    }
  })
  return {
    id,
    externalId: id,
    number: id,
    supplierId: pickStr(raw.VendorNumber) ?? '',
    destinationLocationId: pickStr(raw.SiteName),
    status: mapStatus(raw.Status),
    currency: undefined,
    subtotalAmount: undefined,
    totalAmount: undefined,
    lines,
    expectedAt: toIso(raw.ExpectedDate),
    orderedAt: toIso(raw.OrderDate),
    receivedAt: toIso(raw.ReceivedDate),
    platform: 'wasp-barcode',
    metadata: strMap({ status: raw.Status }),
    raw,
  }
}
