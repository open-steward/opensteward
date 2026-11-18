/**
 * Transform Mabang ERP get-purchase-list response into PurchaseOrder.
 *
 * Mabang field notes (get-purchase-list data[]):
 *   purchaseId      — ERP purchase order numeric ID
 *   orderBillNO     — custom bill / reference number
 *   providerName    — supplier name
 *   providerId      — supplier ID
 *   warehouseName   — destination warehouse name
 *   warehouseCode   — destination warehouse code
 *   status          — 1=draft/pending, 2=submitted, 3=partial, 4=completed, 5=cancelled
 *   currency        — currency code (e.g. "CNY", "USD")
 *   totalMoney      — order total (float, major currency units)
 *   expressMoney    — shipping cost (float)
 *   estimatedTime   — expected delivery (date string)
 *   timeCreated     — creation datetime
 *   stockList       — array of line items
 *     └ stockSku, stockId, price, purchaseNum, receivedNum, totalMoney, remark
 */
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema'
import {pickStr, pickNum, strMap, toIso} from './shared'

export interface RawMabangPurchaseOrderLine {
  stockSku?: string
  stockId?: string | number
  price?: string | number
  purchaseNum?: string | number
  receivedNum?: string | number
  totalMoney?: string | number
  remark?: string
  [key: string]: unknown
}

export interface RawMabangPurchaseOrder {
  purchaseId?: string | number
  orderBillNO?: string
  providerName?: string
  providerId?: string | number
  warehouseName?: string
  warehouseCode?: string
  status?: string | number
  currency?: string
  totalMoney?: string | number
  expressMoney?: string | number
  estimatedTime?: string
  timeCreated?: string
  timeCompleted?: string
  stockList?: RawMabangPurchaseOrderLine[]
  [key: string]: unknown
}

function mapStatus(s: string | number | undefined): PurchaseOrderStatus {
  switch (String(s ?? '')) {
    case '1': return 'draft'
    case '2': return 'sent'
    case '3': return 'partially_received'
    case '4': return 'received'
    case '5': return 'cancelled'
    default: return 'draft'
  }
}

export function transformPurchaseOrder(raw: RawMabangPurchaseOrder): PurchaseOrder {
  const id = String(raw.purchaseId ?? '')
  const supplierId = raw.providerId ? String(raw.providerId) : (pickStr(raw.providerName) ?? '')

  return {
    id,
    externalId: id,
    number: pickStr(raw.orderBillNO),
    supplierId,
    destinationLocationId: pickStr(raw.warehouseCode) ?? pickStr(raw.warehouseName),
    status: mapStatus(raw.status),
    currency: pickStr(raw.currency),
    subtotalAmount: undefined,
    totalAmount: pickNum(raw.totalMoney),
    lines: (raw.stockList ?? []).map((l) => ({
      productId: String(l.stockId ?? l.stockSku ?? ''),
      quantityOrdered: pickNum(l.purchaseNum) ?? 0,
      quantityReceived: pickNum(l.receivedNum),
      unitCost: pickNum(l.price),
      lineTotal: pickNum(l.totalMoney),
    })),
    expectedAt: toIso(raw.estimatedTime),
    orderedAt: toIso(raw.timeCreated),
    receivedAt: toIso(raw.timeCompleted),
    platform: 'mabang-erp',
    metadata: strMap({
      providerName: raw.providerName,
      warehouseName: raw.warehouseName,
      expressMoney: raw.expressMoney,
    }),
    raw,
  }
}
