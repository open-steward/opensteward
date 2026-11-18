/**
 * NuORDER API constants.
 *
 * Reference: https://assets.nuorder.com/api-docs/index.html (primary,
 * per task instructions) — the older https://nuorderapi1.docs.apiary.io/
 * is secondary and was not relied on here.
 */

/** `env` select values shown as example hosts in the docs; production has no subdomain. */
export const NUORDER_ENVIRONMENTS = {
  production: 'nuorder.com',
  next: 'next.nuorder.com',
  sandbox1: 'sandbox1.nuorder.com',
} as const
export type NuorderEnvironment = keyof typeof NUORDER_ENVIRONMENTS

export const DEFAULT_ENVIRONMENT: NuorderEnvironment = 'production'

/** `__limit` default, confirmed for the Catalogs endpoint and applied consistently. */
export const DEFAULT_PAGE_SIZE = 50
/** No documented ceiling was found; capped conservatively. */
export const MAX_PAGE_SIZE = 100

/** Catalogs (→ canonical Collection) are the one resource confirmed to live under a version prefix. */
export const CATALOG_API_VERSION = 'v3.1'
