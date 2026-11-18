/**
 * Acctivate does not expose a supplier / vendor endpoint through its
 * XML web-service API.  The web-service is oriented toward web-store
 * inventory synchronization and does not surface vendor master data.
 * Supplier records live inside the Acctivate desktop application and
 * QuickBooks and are not reachable via the XML web-service protocol.
 *
 * The InventoryAdapter interface makes listSuppliers / getSupplier optional;
 * the acctivate adapter does NOT implement them.
 *
 * This file exists to satisfy the adapter file-shape convention.
 * If Acctivate ever adds a supplier endpoint, extend this stub.
 */
import type { Supplier } from '../../../schema/supplier'

/** Placeholder — not returned by any live Acctivate endpoint */
export interface RawAcctivateSupplier {
  [key: string]: unknown
}

export function transformSupplier(_raw: RawAcctivateSupplier): Supplier {
  throw new Error('acctivate: suppliers are not available via the web-service API')
}
