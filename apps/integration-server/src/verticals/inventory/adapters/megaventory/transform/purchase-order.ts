import { majorToMinor } from '@opensteward/shared'
import type { PurchaseOrder, PurchaseOrderLine } from '../../../schema/purchase-order'
import type { PurchaseOrderStatus } from '../../../schema/shared'
import { toIso, pickStr, pickNum, strMap } from './shared'

/**
 * `PurchaseOrderGet` → `mvPurchaseOrders[]`.
 *
 * Fields confirmed live 2026-09-18 from the service's own metadata. Rows live
 * on `PurchaseOrderDetails[]` and are prefixed `PurchaseOrderRow*`.
 *
 * ── Money ──────────────────────────────────────────────────────────────────
 *
 * Megaventory reports amounts as DECIMAL MAJOR units alongside
 * `PurchaseOrderCurrencyCode`. The canonical Money amount is an INTEGER in
 * MINOR units, so every amount goes through `majorToMinor` with the order's
 * own currency — 12.34 USD is 1234, and a currency with a different exponent
 * (JPY has none, KWD has three) scales differently. Passing the decimal
 * straight through would under-report every total by a factor of 100.
 *
 * ── Status ─────────────────────────────────────────────────────────────────
 *
 * The full status enum is NOT documented and could not be enumerated from the
 * live metadata — the only value appearing in any response example is
 * "Pending". Rather than invent the rest, the receipt state is DERIVED from
 * the row quantities, which are unambiguous and always present, and the raw
 * status string is only consulted for the one value that is confirmed.
 */
export interface RawMegaventoryPurchaseOrderRow {
  PurchaseOrderRowDetailID?: number
  PurchaseOrderRowProductID?: number
  PurchaseOrderRowProductSKU?: string | null
  PurchaseOrderRowProductDescription?: string | null
  PurchaseOrderRowQuantity?: number | null
  PurchaseOrderRowReceivedQuantity?: number | null
  PurchaseOrderRowInvoicedQuantity?: number | null
  PurchaseOrderRowUnitPriceWithoutTaxOrDiscount?: number | null
  PurchaseOrderRowTotalAmount?: number | null
  PurchaseOrderRowExpectedReceivingDateEarliest?: string | null
  PurchaseOrderRowExpectedReceivingDateLatest?: string | null
  [key: string]: unknown
}

export interface RawMegaventoryPurchaseOrder {
  PurchaseOrderId?: number
  PurchaseOrderNo?: string | null
  PurchaseOrderStatus?: string | null
  PurchaseOrderDate?: string | null
  PurchaseOrderCurrencyCode?: string | null
  PurchaseOrderSupplierID?: number | null
  PurchaseOrderInventoryLocationID?: number | null
  PurchaseOrderTotalQuantity?: number | null
  PurchaseOrderAmountSubtotalWithoutTaxAndDiscount?: number | null
  PurchaseOrderAmountGrandTotal?: number | null
  PurchaseOrderComments?: string | null
  PurchaseOrderDetails?: RawMegaventoryPurchaseOrderRow[] | null
  [key: string]: unknown
}

/**
 * Derive the receipt state from the rows.
 *
 * Nothing received and the one confirmed status value → `sent`. Some received
 * → `partially_received`. Everything received → `received`. Any other status
 * string is reported as `unknown` rather than guessed into a terminal state;
 * the true value stays on `raw`, and the canonical enum carries `unknown`
 * precisely so an adapter can say it does not know.
 */
function mapStatus(
  raw: RawMegaventoryPurchaseOrder,
  lines: PurchaseOrderLine[],
): PurchaseOrderStatus {
  const ordered = lines.reduce((sum, l) => sum + l.quantityOrdered, 0)
  const received = lines.reduce((sum, l) => sum + (l.quantityReceived ?? 0), 0)

  if (lines.length > 0 && received > 0) {
    return received >= ordered ? 'received' : 'partially_received'
  }
  // Nothing received yet. "Pending" is the only response value observed in the
  // live metadata examples; anything else is a state this adapter has never
  // seen documented.
  return raw.PurchaseOrderStatus === 'Pending' ? 'sent' : 'unknown'
}

export function transformPurchaseOrder(raw: RawMegaventoryPurchaseOrder): PurchaseOrder {
  const currency = pickStr(raw.PurchaseOrderCurrencyCode)

  // A line with no product reference is dropped: the canonical line requires
  // one, and a line pointing at nothing is worse than an absent line.
  const lines: PurchaseOrderLine[] = (raw.PurchaseOrderDetails ?? [])
    .filter((r) => r.PurchaseOrderRowProductID != null)
    .map((r) => ({
      productId: String(r.PurchaseOrderRowProductID),
      quantityOrdered: pickNum(r.PurchaseOrderRowQuantity) ?? 0,
      quantityReceived: pickNum(r.PurchaseOrderRowReceivedQuantity),
      unitCost: majorToMinor(pickNum(r.PurchaseOrderRowUnitPriceWithoutTaxOrDiscount), currency),
      lineTotal: majorToMinor(pickNum(r.PurchaseOrderRowTotalAmount), currency),
    }))

  // Earliest expected receiving date across the rows: the order is complete
  // when the last line lands, but the first date is when the merchant should
  // start expecting stock, and it is the only per-order-level expectation the
  // payload supports.
  const expected = (raw.PurchaseOrderDetails ?? [])
    .map((r) => toIso(r.PurchaseOrderRowExpectedReceivingDateEarliest))
    .filter((d): d is string => d !== undefined)
    .sort()

  return {
    id: String(raw.PurchaseOrderId ?? ''),
    externalId: String(raw.PurchaseOrderId ?? ''),
    number: pickStr(raw.PurchaseOrderNo),
    supplierId: raw.PurchaseOrderSupplierID != null ? String(raw.PurchaseOrderSupplierID) : '',
    destinationLocationId:
      raw.PurchaseOrderInventoryLocationID != null && raw.PurchaseOrderInventoryLocationID > 0
        ? String(raw.PurchaseOrderInventoryLocationID)
        : undefined,
    status: mapStatus(raw, lines),
    currency,
    subtotalAmount: majorToMinor(
      pickNum(raw.PurchaseOrderAmountSubtotalWithoutTaxAndDiscount),
      currency,
    ),
    totalAmount: majorToMinor(pickNum(raw.PurchaseOrderAmountGrandTotal), currency),
    lines,
    expectedAt: expected[0],
    orderedAt: toIso(raw.PurchaseOrderDate),
    platform: 'megaventory',
    metadata: strMap({
      PurchaseOrderStatus: raw.PurchaseOrderStatus,
      PurchaseOrderTotalQuantity: raw.PurchaseOrderTotalQuantity,
      PurchaseOrderComments: raw.PurchaseOrderComments,
    }),
    raw: raw as unknown as Record<string, unknown>,
  }
}
