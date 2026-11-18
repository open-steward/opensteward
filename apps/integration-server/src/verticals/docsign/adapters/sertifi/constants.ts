/**
 * Sertifi REST API constants.
 *
 * Sertifi exposes a versioned REST API rooted at `/v1.1`. Two environments:
 * production (api.sertifi.com) and sandbox (api-sbx.sertifi.com). Requests
 * authenticate with a portal API code passed in the `sertifi-api-code`
 * header (apiKey scheme).
 *
 * The signing surface is the *folder* — a folder bundles signature
 * documents and participants. There is no top-level "list folders"
 * endpoint, no template resource, and no structured activity feed (the
 * folder summary endpoint returns a rendered PDF, not JSON), so the
 * adapter implements only the resources Sertifi exposes as JSON.
 *
 * Docs: https://sertifi.readme.io/reference/getfolder
 */
export const API_VERSION = 'v1.1'

/** Production REST base. */
export const API_BASE_URL = 'https://api.sertifi.com'

/** Sandbox / test REST base. */
export const SANDBOX_BASE_URL = 'https://api-sbx.sertifi.com'

/**
 * Header that carries the portal API code on every request.
 * Spec: `{ "type": "apiKey", "name": "sertifi-api-code", "in": "header" }`.
 */
export const API_CODE_HEADER = 'sertifi-api-code'

/** Portal page where customers obtain their API code (Administration → Account Settings). */
export const API_CODE_HELP_URL = 'https://supportcenter.sertifi.com/en/sertifi-api.html'
