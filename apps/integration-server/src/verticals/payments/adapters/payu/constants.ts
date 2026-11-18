/**
 * PayU (GPO / EMEA REST API) — pan-European card + APM gateway.
 *
 * Both environments share the same REST surface under `/api/v2_1`. The
 * merchant picks one at Connect time; the choice rides in
 * `Credentials.extra.environment`.
 *
 * Production: https://secure.payu.com
 * Sandbox:    https://secure.snd.payu.com
 */
export const HOSTS = {
  sandbox: 'https://secure.snd.payu.com',
  production: 'https://secure.payu.com',
} as const

export type PayuEnvironment = keyof typeof HOSTS
export const DEFAULT_ENVIRONMENT: PayuEnvironment = 'sandbox'

/** OAuth token endpoint (relative to the chosen host). PayU mints a short-lived
 *  bearer token from a `client_credentials` grant; it is valid for ~12h
 *  (43199 s). */
export const OAUTH_TOKEN_PATH = '/pl/standard/user/oauth/authorize'

/** Versioned REST prefix for orders / refunds / transactions. */
export const API_PREFIX = '/api/v2_1'

/** Re-mint the token this many ms before its declared expiry to avoid races. */
export const TOKEN_REFRESH_SKEW_MS = 60_000

export const DEFAULT_PAGE_SIZE = 50
