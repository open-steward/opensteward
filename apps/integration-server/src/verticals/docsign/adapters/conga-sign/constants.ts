/**
 * Conga Sign REST API constants.
 *
 * Conga Sign is a regional, multi-tenant cloud service (the signing engine is
 * powered by OneSpan). Each region has a distinct RLS host that serves the
 * public signconnector REST API and a distinct login host that issues OAuth2
 * tokens. Auth is OAuth2 client-credentials (machine-to-machine) — there is no
 * user-facing authorization-code redirect.
 *
 * Hosts are pinned per region and selected at runtime via `config.region`
 * (defaults to production US). The signconnector transaction API lives under
 * `/api/signconnector/v1`; the callback-registration API under `/api/sign/callback/v1`.
 *
 * Docs: https://documentation.conga.com/en/sign-for-salesforce/current/conga-sign-for-rest-api-developers/conga-sign-api-region-endpoints
 */

export type CongaSignRegion =
  | 'prod-us'
  | 'prod-eu'
  | 'prod-au'
  | 'preview-us'
  | 'preview-eu'
  | 'preview-au'

interface CongaSignHosts {
  /** RLS host serving the signconnector REST API. */
  apiBaseUrl: string
  /** Login host issuing OAuth2 client-credentials tokens. */
  loginBaseUrl: string
}

export const REGION_HOSTS: Record<CongaSignRegion, CongaSignHosts> = {
  'prod-us': {
    apiBaseUrl: 'https://prod-rls10.congacloud.com',
    loginBaseUrl: 'https://login-rls.congacloud.com',
  },
  'prod-eu': {
    apiBaseUrl: 'https://rls.congacloud.eu',
    loginBaseUrl: 'https://login.congacloud.eu',
  },
  'prod-au': {
    apiBaseUrl: 'https://rls.congacloud.au',
    loginBaseUrl: 'https://login.congacloud.au',
  },
  'preview-us': {
    apiBaseUrl: 'https://preview-rls09.congacloud.com',
    loginBaseUrl: 'https://login-rlspreview.congacloud.com',
  },
  'preview-eu': {
    apiBaseUrl: 'https://rls-preview.congacloud.eu',
    loginBaseUrl: 'https://login-preview.congacloud.eu',
  },
  'preview-au': {
    apiBaseUrl: 'https://rls-preview.congacloud.au',
    loginBaseUrl: 'https://login-preview.congacloud.au',
  },
}

export const DEFAULT_REGION: CongaSignRegion = 'prod-us'

/** OAuth2 client-credentials token endpoint (relative to the login host). */
export const OAUTH_TOKEN_PATH = '/api/v1/auth/connect/token'

/** signconnector REST API path prefix (relative to the RLS host). */
export const SIGNCONNECTOR_PREFIX = '/api/signconnector/v1'

/** Default OAuth2 scope for the Conga Sign signing surface. */
export const DEFAULT_SCOPES = ['sign']
