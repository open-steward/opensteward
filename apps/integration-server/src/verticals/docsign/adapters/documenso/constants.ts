/**
 * Documenso public REST API constants.
 *
 * Documenso is the open-source DocuSign alternative. It authenticates with a
 * single API key passed verbatim (no `Bearer` prefix) in the `Authorization`
 * header. The hosted instance lives at app.documenso.com; self-hosters point
 * the same paths at their own domain.
 *
 * This adapter targets the stable v1 API, which exposes documents (with their
 * recipients embedded) and templates as queryable resources.
 *
 * Docs: https://docs.documenso.com/developers/public-api
 */

/** Default hosted base URL. Self-hosted instances override via credentials.extra.baseUrl. */
export const DEFAULT_BASE_URL = 'https://app.documenso.com/api/v1'

/** Connect-form landing page where customers mint an API token. */
export const API_KEY_SETTINGS_URL = 'https://app.documenso.com/settings/tokens'

/** Documenso paginates lists with `page` (1-indexed) + `perPage`. */
export const DEFAULT_PAGE_SIZE = 10
export const MAX_PAGE_SIZE = 100

/** Webhook secret is delivered verbatim in this header. */
export const WEBHOOK_SECRET_HEADER = 'x-documenso-secret'
