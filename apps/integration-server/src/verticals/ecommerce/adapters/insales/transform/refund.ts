/**
 * InSales does not expose a first-class refund resource via its public REST
 * API. Refund state is inferred from `financial_status === "refunded"` on the
 * order object. This module provides a minimal stub that is not used in
 * production paths — it exists so the file can be imported by index.ts without
 * compile errors in case it is wired up later.
 *
 * The adapter does NOT implement listRefunds / getRefund / createRefund because
 * InSales has no dedicated refund endpoints. Those methods are simply absent on
 * InsalesAdapter and the registry will return 501 automatically.
 */

// This file is intentionally minimal. No transform functions are exported
// because InSales has no refund API endpoints to map to.

export {}
