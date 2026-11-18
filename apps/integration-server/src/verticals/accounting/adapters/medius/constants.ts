/**
 * Medius AP Automation – API constants.
 *
 * Production base: https://cloud.mediusflow.com/{tenant}/api
 * Auth token endpoint: https://login.medius.com/{tenant}/connect/token  (OAuth2 auth-code flow)
 * OAuth2 authorize: https://login.medius.com/{tenant}/oauth/authorize
 *
 * Docs: https://success.medius.com/documentation/integration-documentation/
 * Swagger: https://api.medius.com/mediusapisandboxqa/openapi/stable
 */

export const MEDIUS_API_HOST = 'https://cloud.mediusflow.com'

/** Base URL for all integration REST calls. Tenant slug is injected at runtime. */
export function mediusApiBase(tenant: string): string {
  return `${MEDIUS_API_HOST}/${tenant}/api`
}

/** OAuth2 authorize URL (authorization-code flow). Tenant-specific. */
export function mediusAuthUrl(tenant: string): string {
  return `https://login.medius.com/${tenant}/oauth/authorize`
}

/** OAuth2 token endpoint (tenant-specific). */
export function mediusTokenUrl(tenant: string): string {
  return `https://login.medius.com/${tenant}/connect/token`
}

/** Default OAuth2 scopes for read-only integration access. */
export const MEDIUS_DEFAULT_SCOPES = [
  'Integration.Erp',
  'Integration.Export',
  'Integration.DocumentImport',
  'openid',
]

/** Pagination: Medius enforces max 1 000 records per page on export endpoints. */
export const MAX_PAGE_SIZE = 1000
export const DEFAULT_PAGE_SIZE = 100

/** Supplier-invoice ERP-sync message statuses */
export const MEDIUS_INVOICE_STATUS_POSTED = 'posted'
export const MEDIUS_INVOICE_STATUS_FETCHED = 'fetched'
export const MEDIUS_INVOICE_STATUS_CLOSED = 'closed'
