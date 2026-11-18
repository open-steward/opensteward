/**
 * Crunchtime does not expose a stock-transfer API in the public developer portal.
 * This file is a type-only placeholder so the import in index.ts remains valid
 * if a future version adds transfer support.
 */
import type { StockTransfer } from '../../../schema'

export interface RawCrunchtimeStockTransfer {
  [key: string]: unknown
}

export function transformStockTransfer(_raw: RawCrunchtimeStockTransfer): StockTransfer {
  throw new Error('crunchtime: stock-transfer endpoint not available in public API')
}
