import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

/**
 * Apicbase purchase order (procurement).
 *
 * List endpoint:   GET /api/v2/procurement/purchase_orders/
 * Detail endpoint: GET /api/v2/procurement/purchase_orders/{id}/
 *
 * Key fields:
 *   id                      — Apicbase internal UUID
 *   order_number            — human-readable order reference
 *   status                  — "IN_PROGRESS" | "ORDERED" | "DELIVERED"
 *   ordered_on              — ISO datetime
 *   expected_delivery_date  — ISO datetime or null
 *   theoretical_price       — total order value as string decimal (e.g. "123.45")
 *   supplier                — nested supplier object or ID string
 *   outlet                  — nested outlet object or ID string (destination)
 *   packages                — array of order line items
 *     .stock_item.name           — ingredient name
 *     .supplier_package.supplier_article_number
 *     .supplier_package.theoretical_price_per_package — string decimal
 *     .quantity_ordered          — integer
 *     .total_theoretical_price   — string decimal
 *
 * Amounts: stored as string decimals in the API; we parse to float and multiply
 * by 100 to store as INTEGER MINOR UNITS (cents).
 */
export interface RawApicbasePurchaseOrderPackage {
  stock_item?: { uid?: string; name?: string }
  supplier_package?: {
    supplier_article_number?: string
    supplier_product_name?: string | null
    theoretical_price_per_package?: string | number
  }
  quantity_ordered?: number
  total_theoretical_price?: string | number
  [key: string]: unknown
}

export interface RawApicbasePurchaseOrder {
  id: string
  order_number?: string
  status?: string
  ordered_on?: string | null
  expected_delivery_date?: string | null
  theoretical_price?: string | number
  supplier?: string | { uid?: string; id?: string } | null
  outlet?: string | { uid?: string; id?: string } | null
  packages?: RawApicbasePurchaseOrderPackage[]
  [key: string]: unknown
}

function mapStatus(s: string | undefined): PurchaseOrderStatus {
  switch ((s ?? '').toUpperCase()) {
    case 'IN_PROGRESS': return 'draft'
    case 'ORDERED': return 'sent'
    case 'DELIVERED': return 'received'
    default: return 'draft'
  }
}

function extractId(v: string | { uid?: string; id?: string } | null | undefined): string {
  if (!v) return ''
  if (typeof v === 'string') return v
  return pickStr(v.uid ?? v.id) ?? ''
}

/** Parse a decimal string like "123.45" → integer minor units 12345. */
function toMinorUnits(v: string | number | undefined): number | undefined {
  if (v === undefined || v === null) return undefined
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''))
  if (Number.isNaN(n)) return undefined
  return Math.round(n * 100)
}

export function transformPurchaseOrder(raw: RawApicbasePurchaseOrder): PurchaseOrder {
  return {
    id: raw.id,
    externalId: raw.id,
    number: pickStr(raw.order_number),
    supplierId: extractId(raw.supplier),
    destinationLocationId: pickStr(extractId(raw.outlet)) || undefined,
    status: mapStatus(raw.status),
    currency: undefined,
    subtotalAmount: undefined,
    totalAmount: toMinorUnits(raw.theoretical_price),
    lines: (raw.packages ?? []).map((pkg) => ({
      productId: pickStr(pkg.stock_item?.uid) ?? '',
      quantityOrdered: pkg.quantity_ordered ?? 0,
      quantityReceived: undefined,
      unitCost: toMinorUnits(pkg.supplier_package?.theoretical_price_per_package),
      lineTotal: toMinorUnits(pkg.total_theoretical_price),
    })),
    expectedAt: toIso(raw.expected_delivery_date),
    orderedAt: toIso(raw.ordered_on),
    receivedAt: undefined,
    platform: 'apicbase',
    metadata: strMap({ rawStatus: raw.status }),
    raw,
  }
}
