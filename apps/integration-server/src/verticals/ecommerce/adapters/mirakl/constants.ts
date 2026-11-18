/**
 * Mirakl Marketplace Platform (MMP) REST API constants.
 *
 * Mirakl is a multi-tenant SaaS: every operator instance runs on a
 * dedicated subdomain — there is no single canonical production base URL.
 * The `baseUrl` is therefore a per-connection credential
 * (`https://{operator-instance}.mirakl.net`).
 *
 * All resource paths are prefixed with `/api` and versioning is handled
 * by the platform (no explicit version path segment).
 *
 * Auth: API key sent directly in the `Authorization` header (no Bearer
 * prefix, no Basic scheme) — see `./auth.ts`.
 *
 * Pagination: token-based (`next_page_token` / `page_token`). The `limit`
 * parameter controls page size (default 10, max 100).
 *
 * Docs: https://developer.mirakl.com/content/product/mmp/rest/seller/openapi3
 */

/** Default number of items per page for list requests. */
export const DEFAULT_PAGE_SIZE = 20

/** Maximum allowed page size for Mirakl list APIs. */
export const MAX_PAGE_SIZE = 100

/**
 * Mirakl Marketplace Platform API paths (seller role).
 * All are relative to `{baseUrl}/api`.
 */
export const PATHS = {
  orders: '/api/orders',
  order: (id: string) => `/api/orders/${id}`,
  orderAccept: (id: string) => `/api/orders/${id}/accept`,
  orderCancel: (id: string) => `/api/orders/${id}/cancel`,
  orderRefund: '/api/orders/refund',
  offers: '/api/offers',
  offersImports: '/api/offers/imports',
  offer: (id: string) => `/api/offers/${id}`,
  /** GET /api/shipments — list shipments (ST11). */
  shipments: '/api/shipments',
  returns: '/api/returns',
  /** GET /api/promotions — list promotions (PR01). */
  promotions: '/api/promotions',
  /** GET /api/sellerpayment/transactions_logs — list transaction lines (TL02). */
  transactionLogs: '/api/sellerpayment/transactions_logs',
  account: '/api/account',
  reasons: (type: string) => `/api/reasons/${type}`,
} as const
