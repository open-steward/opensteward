import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

/**
 * Raw receipt (inbound purchase order) from GET /receipts or GET /receipt/{receipt_id}.
 * SphereWMS calls inbound receipts "receipts"; each receipt maps to a purchase order.
 * Fields sourced from SphereWMS API v2.27.0.
 */
export interface RawSphereWmsReceipt {
  receipt_id: string | number
  arn_id?: string | number
  client_code?: string
  location_id?: string
  status?: string
  status_code?: string | number
  arn_reference_1?: string
  arn_reference_2?: string
  arn_reference_3?: string
  receipt_date?: string
  arn_date?: string
  created_on?: string
  posted_on?: string
  ship_from?: {
    code?: string
    name?: string
    [key: string]: unknown
  }
  items?: Array<{
    product_id?: string | number
    product_code?: string
    quantity?: number
    received_qty?: number
    unit_cost?: number
    total_cost?: number
    [key: string]: unknown
  }>
  total_amount?: number
  [key: string]: unknown
}

function mapStatus(status: string | undefined, statusCode: string | number | undefined): PurchaseOrderStatus {
  const s = (status ?? '').toLowerCase()
  const code = Number(statusCode ?? 0)
  if (s.includes('cancel') || s.includes('void')) return 'cancelled'
  if (s.includes('complete') || s.includes('close') || code >= 90) return 'closed'
  if (s.includes('put away') || s.includes('putaway') || s.includes('received')) return 'received'
  if (s.includes('partial')) return 'partially_received'
  if (s.includes('open') || s.includes('pending') || code > 0) return 'sent'
  return 'draft'
}

export function transformPurchaseOrder(raw: RawSphereWmsReceipt): PurchaseOrder {
  const id = String(raw.receipt_id)
  const supplierId = raw.ship_from?.code ?? raw.ship_from?.name ?? ''
  return {
    id,
    externalId: id,
    number: pickStr(raw.arn_reference_1) ?? pickStr(raw.arn_id),
    supplierId,
    destinationLocationId: pickStr(raw.location_id),
    status: mapStatus(raw.status, raw.status_code),
    currency: undefined,
    subtotalAmount: undefined,
    totalAmount: raw.total_amount,
    lines: (raw.items ?? []).map((item) => ({
      productId: String(item.product_id ?? item.product_code ?? ''),
      quantityOrdered: item.quantity ?? 0,
      quantityReceived: item.received_qty,
      unitCost: item.unit_cost,
      lineTotal: item.total_cost,
    })),
    expectedAt: toIso(raw.arn_date),
    orderedAt: toIso(raw.created_on),
    receivedAt: toIso(raw.posted_on),
    platform: 'spherewms',
    metadata: strMap({
      arnId: raw.arn_id,
      clientCode: raw.client_code,
      arnReference2: raw.arn_reference_2,
      arnReference3: raw.arn_reference_3,
      receiptDate: raw.receipt_date,
    }),
    raw,
  }
}
