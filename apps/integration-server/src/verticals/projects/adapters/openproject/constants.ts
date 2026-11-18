/**
 * OpenProject is self-hosted / per-tenant SaaS: there is no single global
 * API host. Each customer runs at their own origin (e.g.
 * `https://acme.openproject.com` or an on-prem domain). The instance origin
 * is supplied per-connection via `credentials.extra.instanceUrl`; these
 * paths are appended to that origin.
 *
 * REST API: HAL+JSON, version v3. OAuth2 is provided by the Doorkeeper gem.
 * Docs: https://www.openproject.org/docs/api/
 */

/** Path prefix for all REST resources, relative to the instance origin. */
export const API_PATH_PREFIX = '/api/v3'

/** OAuth2 authorization endpoint path (relative to instance origin). */
export const OAUTH_AUTHORIZE_PATH = '/oauth/authorize'

/** OAuth2 token endpoint path (relative to instance origin). */
export const OAUTH_TOKEN_PATH = '/oauth/token'

/** Elements per page when the caller names no limit. */
export const DEFAULT_PAGE_SIZE = 100

/**
 * The default of the instance's API "maximum page size" setting
 * (`apiv3_max_page_size`, default 1000 in config/constants/settings/definition.rb).
 * An admin can lower it; the server then answers with its smaller `pageSize`,
 * which the adapter reports.
 */
export const MAX_PAGE_SIZE = 1000

/** The single OAuth scope that grants API v3 access. */
export const DEFAULT_SCOPES = ['api_v3']
