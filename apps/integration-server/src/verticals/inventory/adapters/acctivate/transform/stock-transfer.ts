/**
 * Acctivate does not expose a stock-transfer endpoint through its
 * XML web-service API.  The web-service is oriented toward web-store
 * inventory synchronization and does not surface transfer transactions.
 * Transfer records live inside the Acctivate desktop application and
 * are not reachable via the XML web-service protocol.
 *
 * The InventoryAdapter interface makes listStockTransfers /
 * getStockTransfer optional; the acctivate adapter does NOT implement them.
 *
 * This file exists to satisfy the adapter file-shape convention.
 * If Acctivate ever adds a stock-transfer endpoint, extend this stub.
 */
import type { StockTransfer } from '../../../schema/stock-transfer'

/** Placeholder — not returned by any live Acctivate endpoint */
export interface RawAcctivateStockTransfer {
  [key: string]: unknown
}

export function transformStockTransfer(_raw: RawAcctivateStockTransfer): StockTransfer {
  throw new Error('acctivate: stock transfers are not available via the web-service API')
}
