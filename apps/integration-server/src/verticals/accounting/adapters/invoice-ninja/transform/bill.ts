/**
 * Invoice Ninja does not have a separate "bills" (accounts payable) resource.
 * The closest concept is an expense linked to a vendor or a vendor credit.
 * This file intentionally exports nothing — the adapter does not implement
 * listBills / getBill and those methods will return HTTP 501 automatically.
 *
 * If Invoice Ninja adds a bill/AP endpoint in a future API version this file
 * should be populated following the canonical Bill schema in
 * apps/integration-server/src/verticals/accounting/schema/bill.ts
 */

// No-op export to keep TypeScript happy with the transform/ directory structure.
export {}

