/**
 * InSales does not expose a dedicated transaction resource via its public REST
 * API. Payment information is embedded on orders via `financial_status` and
 * `payment_gateway_id`. This module is intentionally empty — InsalesAdapter
 * does not implement transaction methods, and the registry returns 501
 * automatically for absent methods.
 */

export {}
