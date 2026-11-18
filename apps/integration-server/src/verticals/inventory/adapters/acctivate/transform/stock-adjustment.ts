/**
 * Acctivate does not expose a stock-adjustment endpoint through its
 * XML web-service API.  The web-service is oriented toward web-store
 * inventory synchronization and does not surface adjustment transactions.
 * Adjustment records live inside the Acctivate desktop application and
 * are not reachable via the XML web-service protocol.
 *
 * The InventoryAdapter interface makes listStockAdjustments /
 * getStockAdjustment optional; the acctivate adapter does NOT implement them.
 *
 * This file exists to satisfy the adapter file-shape convention.
 * If Acctivate ever adds a stock-adjustment endpoint, extend this stub.
 */
import type { StockAdjustment } from '../../../schema/stock-adjustment'

/** Placeholder — not returned by any live Acctivate endpoint */
export interface RawAcctivateStockAdjustment {
  [key: string]: unknown
}

export function transformStockAdjustment(_raw: RawAcctivateStockAdjustment): StockAdjustment {
  throw new Error('acctivate: stock adjustments are not available via the web-service API')
}
