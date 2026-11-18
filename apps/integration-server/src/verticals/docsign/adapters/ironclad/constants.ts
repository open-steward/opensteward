/**
 * Ironclad CLM Public API constants.
 *
 * Ironclad is region-hosted: the majority of customers live on `na1`
 * (North America production), EU customers on `eu1`, and there is a shared
 * `demo` sandbox. The REST API and the OAuth endpoints share the same host;
 * the active host is resolved at runtime from `credentials.extra.region`
 * (default `na1`), so the constants below pin only the default-host paths.
 *
 * Docs: https://developer.ironcladapp.com/reference/getting-started-api
 */

/** Region subdomain used when none is supplied on the credential. */
export const DEFAULT_REGION = 'na1'

/** Build the region host, e.g. https://na1.ironcladapp.com */
export function regionHost(region: string = DEFAULT_REGION): string {
  return `https://${region}.ironcladapp.com`
}

/** REST API base path appended to the region host. */
export const API_BASE_PATH = '/public/api/v1'

/** OAuth 2.0 authorization-code endpoints (region-scoped paths). */
export const OAUTH_AUTHORIZE_PATH = '/oauth/authorize'
export const OAUTH_TOKEN_PATH = '/oauth/token'

export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 100

/**
 * Read-only scopes for the docsign surface. Ironclad scopes are namespaced
 * `public.<resource>.<action>`. These cover workflows (the envelope
 * analogue), their schemas, approvals, documents + sign-status, and record
 * reads.
 */
export const DEFAULT_SCOPES = [
  'public.workflows.readWorkflows',
  'public.workflows.readSchemas',
  'public.workflows.readApprovals',
  'public.workflows.readDocuments',
  'public.workflows.cancel',
  'public.records.readRecords',
  'public.records.readSchemas',
]
