/**
 * Transform ECCANG purchase order (采购单) records to the canonical PurchaseOrder schema.
 */
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema'
import {pickStr, pickNum, strMap, toIso} from './shared'

export interface RawEccangPurchaseOrderLine {
  goods_id?: string | number
  sku_id?: string | number
  goods_no?: string
  purchase_qty?: number | string
  received_qty?: number | string
  purchase_price?: number | string
  line_total?: number | string
  [key: string]: unknown
}

export interface RawEccangPurchaseOrder {
  purchase_order_id?: string | number
  purchase_order_no?: string
  supplier_id?: string | number
  supplier_code?: string
  warehouse_id?: string | number
  warehouse_code?: string
  status?: string | number
  currency?: string
  total_amount?: number | string
  sub_total?: number | string
  order_date?: string
  expected_date?: string
  finish_date?: string
  items?: RawEccangPurchaseOrderLine[]
  [key: string]: unknown
}

function mapStatus(s: string | number | undefined): PurchaseOrderStatus {
  const v = String(s ?? '').toLowerCase()
  if (v === 'draft' || v === '0') return 'draft'
  if (v === 'sent' || v === 'ordered' || v === '1') return 'sent'
  if (v === 'partial' || v.includes('partial')) return 'partially_received'
  if (v === 'received' || v === '3') return 'received'
  if (v === 'closed' || v === 'completed' || v === '4') return 'closed'
  if (v === 'cancelled' || v === 'voided' || v === '5') return 'cancelled'
  return 'draft'
}

export function transformPurchaseOrder(raw: RawEccangPurchaseOrder): PurchaseOrder {
  const id = String(raw.purchase_order_id ?? '')
  return {
    id,
    externalId: id,
    number: pickStr(raw.purchase_order_no),
    supplierId: String(raw.supplier_id ?? raw.supplier_code ?? ''),
    destinationLocationId: raw.warehouse_id ? String(raw.warehouse_id) : pickStr(raw.warehouse_code),
    status: mapStatus(raw.status),
    currency: pickStr(raw.currency),
    subtotalAmount: pickNum(raw.sub_total),
    totalAmount: pickNum(raw.total_amount),
    lines: (raw.items ?? []).map((l) => ({
      productId: String(l.sku_id ?? l.goods_id ?? ''),
      quantityOrdered: pickNum(l.purchase_qty) ?? 0,
      quantityReceived: pickNum(l.received_qty),
      unitCost: pickNum(l.purchase_price),
      lineTotal: pickNum(l.line_total),
    })),
    expectedAt: toIso(raw.expected_date),
    orderedAt: toIso(raw.order_date),
    receivedAt: toIso(raw.finish_date),
    platform: 'eccang',
    metadata: strMap({ warehouseCode: raw.warehouse_code, supplierCode: raw.supplier_code }),
    raw,
  }
}
