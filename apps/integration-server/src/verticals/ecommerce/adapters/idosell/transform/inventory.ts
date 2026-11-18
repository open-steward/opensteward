/**
 * IdoSell per-product stock data → canonical InventoryLevel[].
 *
 * IdoSell has no store-wide "list all inventory levels" endpoint — stock is
 * nested inside each product's `productStocksData.productStocksQuantities[]`
 * (per warehouse / `stockId`), itself broken down by size in
 * `productSizesData[]`. Confirmed on the same OpenAPI fragment as
 * `transform/product.ts` (productsproductsget / productsproductssearchpost).
 * `GET /products/stocks` (productsstocksget) exposes the identical shape for
 * an explicit batch of product ids and is used for `getInventoryLevel`.
 *
 * `available` is computed as on-hand quantity minus the sum of the
 * documented reservation buckets (ad hoc / auction / client / order /
 * retail / wholesale) — IdoSell does not return a pre-subtracted
 * "available" figure directly.
 */

import type { InventoryLevel } from '../../../schema/inventory'
import { toIsoDatetime } from '@opensteward/shared'

export interface RawIdosellReservations {
  productSizeReservationAdhoc?: number
  productSizeReservationAuction?: number
  productSizeReservationClient?: number
  productSizeReservationOrder?: number
  productSizeReservationRetail?: number
  productSizeReservationWholesale?: number
}

export interface RawIdosellSizeStock {
  sizeId?: string
  sizePanelName?: string
  productSizeQuantity?: number
  productSizeReservations?: RawIdosellReservations
}

export interface RawIdosellStockRow {
  stockId: number | string
  productSizesData?: RawIdosellSizeStock[]
}

export interface RawIdosellProductStocksData {
  productStocksQuantities?: RawIdosellStockRow[]
}

function sumReservations(r: RawIdosellReservations | undefined): number {
  if (!r) return 0
  return (
    (r.productSizeReservationAdhoc ?? 0) +
    (r.productSizeReservationAuction ?? 0) +
    (r.productSizeReservationClient ?? 0) +
    (r.productSizeReservationOrder ?? 0) +
    (r.productSizeReservationRetail ?? 0) +
    (r.productSizeReservationWholesale ?? 0)
  )
}

/**
 * `available` and `id`/`variantId` are required on the canonical schema, so
 * a row missing the size identifier or the reported on-hand quantity is
 * skipped rather than published with a fabricated `0`.
 */
export function extractInventoryLevels(
  productId: string,
  stocksData: RawIdosellProductStocksData | undefined,
  updatedAt?: string,
): InventoryLevel[] {
  const out: InventoryLevel[] = []
  for (const stock of stocksData?.productStocksQuantities ?? []) {
    const stockId = String(stock.stockId)
    for (const size of stock.productSizesData ?? []) {
      if (!size.sizeId || size.productSizeQuantity == null) continue
      const onHand = size.productSizeQuantity
      // A row that reports no `productSizeReservations` object at all is
      // read as "nothing reserved", not "unknown" — each bucket it does
      // carry is a directly-reported count, never a fabricated total.
      const reserved = sumReservations(size.productSizeReservations)
      const variantId = `${productId}:${size.sizeId}`
      out.push({
        id: `${variantId}:${stockId}`,
        variantId,
        locationId: stockId,
        available: Math.max(0, onHand - reserved),
        committed: reserved > 0 ? reserved : undefined,
        onHand,
        updatedAt: toIsoDatetime(updatedAt),
        metadata: { ...size, stockId } as unknown as Record<string, unknown>,
      })
    }
  }
  return out
}
