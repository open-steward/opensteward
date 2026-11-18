/**
 * Kaufland Marketplace does not expose a standalone transaction resource in
 * the Seller API. Payment processing is fully managed by Kaufland; sellers
 * cannot list or create transactions programmatically.
 *
 * This file is intentionally minimal. The transaction methods are omitted from
 * the adapter (index.ts) so the registry returns 501 for those endpoints.
 *
 * If Kaufland adds a transaction API in the future, implement the transform
 * here and register the methods in index.ts.
 */

// No exports — file kept as a placeholder to document the intentional gap.
