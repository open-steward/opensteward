/**
 * 3PL Central does not expose a dedicated stock-transfer (bin-to-bin transfer)
 * endpoint in the public REST API. This file is intentionally minimal.
 * The InventoryAdapter interface makes listStockTransfers/getStockTransfer
 * optional; the 3plcentral adapter does NOT implement them.
 *
 * If Extensiv ever adds a transfer endpoint this file can be extended.
 */
import type { StockTransfer } from '../../../schema'

/** Placeholder — not returned by any live endpoint */
export interface Raw3plCentralStockTransfer {
  [key: string]: unknown
}

export function transformStockTransfer(_raw: Raw3plCentralStockTransfer): StockTransfer {
  throw new Error('3plcentral: stock transfers are not available via the public REST API')
}
