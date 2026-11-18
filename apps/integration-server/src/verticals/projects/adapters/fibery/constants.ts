/**
 * Fibery API constants.
 *
 * Fibery exposes a single command-based HTTP endpoint. The base URL is
 * account-scoped: https://{account}.fibery.io/api/commands
 *
 * Docs: https://developers.fibery.com/guides/http-api/overview
 */

/**
 * Template for the Fibery commands endpoint. Replace {account} with the
 * customer's workspace subdomain (e.g. "mycompany" → "mycompany.fibery.io").
 */
export const API_BASE_URL_TEMPLATE = 'https://{account}.fibery.io'

/** Single POST endpoint for all read/write commands. */
export const COMMANDS_PATH = '/api/commands'

/** Webhooks management endpoint (REST, not command-based). */
export const WEBHOOKS_PATH = '/api/webhooks/v2'

/** Token management endpoint (REST, not command-based). */
export const TOKENS_PATH = '/api/tokens'

/** Token help URL shown during Connect Link auth setup. */
export const TOKEN_HELP_URL = 'https://developers.fibery.com/guides/getting-started/authentication'

/**
 * Default page size for entity queries.
 * Fibery uses cursor-based pagination: request limit+1 to detect more pages.
 */
export const DEFAULT_PAGE_SIZE = 50

/**
 * System field names present on every Fibery entity.
 * These use the reserved "fibery/" namespace.
 */
export const FIELD_ID = 'fibery/id'
export const FIELD_PUBLIC_ID = 'fibery/public-id'
export const FIELD_CREATION_DATE = 'fibery/creation-date'
export const FIELD_MODIFICATION_DATE = 'fibery/modification-date'
export const FIELD_CREATED_BY = 'fibery/created-by'
export const FIELD_RANK = 'fibery/rank'

/** The built-in user database name used in q/from. */
export const USER_TYPE = 'fibery/user'

/** User fields available on the fibery/user type. */
export const USER_FIELD_NAME = 'user/name'
export const USER_FIELD_EMAIL = 'user/email'

/** The built-in comment database name used in q/from. */
export const COMMENT_TYPE = 'comments/comment'
