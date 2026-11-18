/**
 * APEXX Global Atomic REST API constants.
 *
 * APEXX exposes two hosts with an identical endpoint surface: a sandbox for
 * test integrations and production (`liveapi`). Operators point a connection at
 * production via the connection's base-URL override; we default to sandbox so a
 * freshly issued sandbox key works out of the box.
 *
 * All Atomic endpoints live under the `/atomic/v1/api` prefix. Auth is a static
 * `x-apikey` header (see `auth.ts`). APEXX requires at least TLS 1.2 for every
 * HTTPS connection.
 *
 * Amounts are integer minor units on the wire (APEXX submits/returns money
 * without a decimal point and infers the decimal position from `currency` —
 * £14.08 GBP is `1408`), which already matches the canonical minor-unit
 * contract, so no float coercion is needed in the transforms.
 *
 * Docs: https://support.apexx.global/support/solutions/articles/19000111097-apexx-api-reference
 */
export const API_BASE_URL = 'https://sandbox.apexx.global/atomic/v1/api'
export const PRODUCTION_BASE_URL = 'https://liveapi.apexx.global/atomic/v1/api'

/** Page size for the `/transactions` list endpoint (`limit` query param). */
export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 100
