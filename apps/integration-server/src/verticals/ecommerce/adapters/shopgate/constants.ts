/**
 * Shopgate Omnichannel API constants.
 *
 * Shopgate exposes multiple micro-services. Each is addressed as:
 *   https://{service}.shopgate{env}.io/v1/merchants/{merchantCode}/{path}
 *
 * Environments:
 *   production → env suffix = ""    (e.g. catalog.shopgate.io)
 *   staging    → env suffix = "pg"  (e.g. catalog.shopgatepg.io)
 *   dev        → env suffix = "dev" (e.g. catalog.shopgatedev.io)
 *
 * OAuth2 token endpoint: https://auth.shopgate{env}.io/oauth/token
 *
 * Docs: https://docs.shopgate.com/docs/retail-red
 */

export const API_VERSION = 'v1'

/** Service-name prefixes used to build per-service base URLs. */
export const SERVICES = {
  catalog: 'catalog',
  order: 'order',
  customer: 'customer',
  location: 'location',
  auth: 'auth',
} as const
export type ServiceName = (typeof SERVICES)[keyof typeof SERVICES]

export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 100

/** Environment suffixes (empty string = production). */
export const ENVS = {
  production: '',
  staging: 'pg',
  dev: 'dev',
} as const
export type ShopgateEnv = (typeof ENVS)[keyof typeof ENVS]
