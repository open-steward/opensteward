/**
 * Acctivate does not expose a purchase-order endpoint through its
 * XML web-service API.  The web-service is solely designed for web-store
 * inventory synchronization (UpdateInventory push) and QueryOrder only
 * returns web orders placed via the web store, not vendor purchase orders.
 * PO records live inside the Acctivate desktop application and QuickBooks
 * and are not reachable via the XML web-service protocol.
 *
 * The InventoryAdapter interface makes listPurchaseOrders / getPurchaseOrder
 * optional; the acctivate adapter does NOT implement them.
 *
 * This file exists to satisfy the adapter file-shape convention.
 * If Acctivate ever adds a purchase-order endpoint, extend this stub.
 */
import type { PurchaseOrder } from '../../../schema/purchase-order'

/** Placeholder — not returned by any live Acctivate endpoint */
export interface RawAcctivtatePurchaseOrder {
  [key: string]: unknown
}

export function transformPurchaseOrder(_raw: RawAcctivtatePurchaseOrder): PurchaseOrder {
  throw new Error('acctivate: purchase orders are not available via the web-service API')
}
