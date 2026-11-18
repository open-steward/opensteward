export const API_BASE_URL = 'https://api.notion.com/v1'
export const OAUTH_AUTHORIZE_URL = 'https://api.notion.com/v1/oauth/authorize'
export const OAUTH_TOKEN_URL = 'https://api.notion.com/v1/oauth/token'

/**
 * Notion pins request behaviour to a date-stamped API version sent on every
 * request via the `Notion-Version` header (not a path segment). The
 * `data_source` resources this adapter reads require 2025-09-03 or later.
 */
export const NOTION_VERSION = '2026-03-11'

/** Notion's default page_size ("Default: 100 Maximum: 100", https://developers.notion.com/reference/intro). */
export const DEFAULT_PAGE_SIZE = 100

/**
 * Notion grants capabilities (read content / comments / user info) at
 * integration-setup time rather than via an OAuth `scope` query param, so no
 * scopes are sent on the authorize URL. Kept for interface symmetry with the
 * other projects adapters.
 */
export const DEFAULT_SCOPES: string[] = []

/** Notion's documented page_size maximum ("Maximum: 100", https://developers.notion.com/reference/intro). */
export const MAX_PAGE_SIZE = 100
