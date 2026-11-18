/**
 * ikas does not expose a dedicated Transaction resource via the GraphQL API.
 * Payment transaction data is embedded within the Order response under
 * payment-related fields and is not accessible as standalone transaction records.
 *
 * This module is intentionally minimal and exists to satisfy the interface
 * contract. The adapter does not implement listTransactions / getTransaction /
 * createTransaction — those methods are not registered and will auto-501.
 *
 * If ikas exposes transaction data in a future API version, implement the
 * transform here and wire it into index.ts.
 */

// This file intentionally exports nothing — ikas has no standalone transaction API.
export {}
