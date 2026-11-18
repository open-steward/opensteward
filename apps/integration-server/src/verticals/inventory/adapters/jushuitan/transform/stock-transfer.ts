/**
 * Jushuitan stock-transfer transform.
 *
 * Jushuitan's open API does not expose a documented inter-warehouse transfer
 * query endpoint in the public SDK or developer documentation. This file
 * provides the type and transform stub so that the adapter satisfies the
 * interface; the adapter does NOT register listStockTransfers / getStockTransfer.
 */
import type { StockTransfer } from '../../../schema/stock-transfer'
import {strMap} from './shared'

export interface RawJushuitanStockTransfer {
  [key: string]: unknown
}

export function transformStockTransfer(_raw: RawJushuitanStockTransfer): StockTransfer {
  // Should never be called — the adapter does not implement transfer methods.
  return {
    id: '',
    externalId: '',
    fromLocationId: '',
    toLocationId: '',
    status: 'draft',
    lines: [],
    platform: 'jushuitan',
    metadata: strMap({}),
    raw: {},
  }
}
