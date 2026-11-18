/**
 * Transform Epicor Kinetic POHeader (POSvc/POHeaders) → canonical PurchaseOrder.
 *
 * Epicor PO lines come from a separate POSvc/PODetails collection joined by PONum.
 * This transform accepts the header with an optional pre-fetched lines array
 * (RawEpicorKineticPODetail[]) attached as `_lines`.
 *
 * Key Epicor POHeader fields (REST v2 POSvc):
 *   PONum         — internal PO number (primary key)
 *   VendorNum     — supplier numeric ID
 *   OrderDate     — date order was placed
 *   DueDate       — expected delivery date
 *   ShipToConNum  — ship-to contact / warehouse hint
 *   CurrencyCode  — PO currency
 *   DocTotalOrder — total order amount in document currency
 *   OpenPO        — boolean; false = closed/completed
 *   ApprovalStatus — "A" approved, "U" unapproved, "R" rejected
 *   EntryPerson   — who created the PO
 *
 * Key Epicor PODetail fields:
 *   PONum, POLine  — composite key
 *   PartNum        — product / part key
 *   XOrderQty      — ordered quantity
 *   ReceivedQty    — received quantity
 *   DocUnitCost    — unit cost in document currency
 *   DocExtCost     — line total in document currency
 *   WarehouseCode  — destination warehouse
 */
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

export interface RawEpicorKineticPODetail {
  PONum: number
  POLine: number
  PartNum: string
  XOrderQty?: number
  ReceivedQty?: number
  DocUnitCost?: number
  DocExtCost?: number
  WarehouseCode?: string
  [key: string]: unknown
}

export interface RawEpicorKineticPOHeader {
  PONum: number
  VendorNum?: number
  VendorID?: string
  OrderDate?: string
  DueDate?: string
  CurrencyCode?: string
  DocTotalOrder?: number
  OpenPO?: boolean
  ApprovalStatus?: string
  EntryPerson?: string
  SysRowID?: string
  /** Pre-fetched PO detail lines (optional; populated by listPurchaseOrders). */
  _lines?: RawEpicorKineticPODetail[]
  [key: string]: unknown
}

function mapStatus(raw: RawEpicorKineticPOHeader): PurchaseOrderStatus {
  if (!raw.OpenPO) return 'closed'
  const approval = (raw.ApprovalStatus ?? '').toUpperCase()
  if (approval === 'U') return 'draft'
  if (approval === 'R') return 'cancelled'
  // Approved + open = sent
  return 'sent'
}

export function transformPurchaseOrder(raw: RawEpicorKineticPOHeader): PurchaseOrder {
  const lines = (raw._lines ?? []).map((l) => ({
    productId:        l.PartNum,
    quantityOrdered:  l.XOrderQty ?? 0,
    quantityReceived: l.ReceivedQty,
    unitCost:         l.DocUnitCost,
    lineTotal:        l.DocExtCost,
  }))

  return {
    id:                    String(raw.PONum),
    externalId:            raw.SysRowID ?? String(raw.PONum),
    number:                String(raw.PONum),
    supplierId:            raw.VendorNum !== undefined ? String(raw.VendorNum) : (pickStr(raw.VendorID) ?? ''),
    destinationLocationId: undefined,
    status:                mapStatus(raw),
    currency:              pickStr(raw.CurrencyCode),
    subtotalAmount:        undefined,
    totalAmount:           raw.DocTotalOrder,
    lines,
    expectedAt:            toIso(raw.DueDate),
    orderedAt:             toIso(raw.OrderDate),
    receivedAt:            undefined,
    platform:              'epicor-kinetic',
    metadata:              strMap({
      approvalStatus: raw.ApprovalStatus,
      entryPerson:    raw.EntryPerson,
      openPO:         raw.OpenPO,
    }),
    raw,
  }
}
