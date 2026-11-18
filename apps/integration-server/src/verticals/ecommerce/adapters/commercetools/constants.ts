/**
 * commercetools regional hosts + pagination limits.
 *
 * commercetools is a multi-region SaaS — every API call (auth + data) goes
 * to the host for the project's region. The `REGIONS` map is the canonical
 * set of supported regions; adapter code should fail fast if a caller
 * supplies an unknown region slug.
 */

export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 500
/** commercetools hard-caps offset pagination at 10,000. */
export const MAX_OFFSET = 10_000
/** Consider a token "about to expire" this many ms before its real expiry. */
export const TOKEN_BUFFER_MS = 5 * 60 * 1000
/** Default primary locale used to flatten localized strings into canonical scalars. */
export const DEFAULT_LOCALE = 'en-US'
/** Fallback region if the caller does not specify one. */
export const DEFAULT_REGION = 'europe-west1.gcp'

export const REGIONS: Record<string, { authHost: string; apiHost: string }> = {
  'us-central1.gcp': {
    authHost: 'auth.us-central1.gcp.commercetools.com',
    apiHost: 'api.us-central1.gcp.commercetools.com',
  },
  'us-east-2.aws': {
    authHost: 'auth.us-east-2.aws.commercetools.com',
    apiHost: 'api.us-east-2.aws.commercetools.com',
  },
  'europe-west1.gcp': {
    authHost: 'auth.europe-west1.gcp.commercetools.com',
    apiHost: 'api.europe-west1.gcp.commercetools.com',
  },
  'eu-central-1.aws': {
    authHost: 'auth.eu-central-1.aws.commercetools.com',
    apiHost: 'api.eu-central-1.aws.commercetools.com',
  },
  'australia-southeast1.gcp': {
    authHost: 'auth.australia-southeast1.gcp.commercetools.com',
    apiHost: 'api.australia-southeast1.gcp.commercetools.com',
  },
}
