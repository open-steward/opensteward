/**
 * Perdoo GraphQL API constants.
 *
 * Perdoo exposes a GraphQL API (not REST) at the EU production endpoint.
 * Authentication uses a long-lived bearer token generated from
 * Personal Settings → Integrations — no OAuth2 authorization-code flow.
 * Credentials are collected through the Connect Link form (`simpleApiKey`).
 * There is no separate sandbox host.
 *
 * Docs: https://support.perdoo.com/en/articles/3629954-api
 * Studio: https://api-docs.perdoo.com/
 */

/** Production GraphQL endpoint (EU host; only available host). */
export const API_BASE_URL = 'https://api-eu.perdoo.com/graphql/'

/** Where users generate their API bearer token. */
export const TOKEN_HELP_URL = 'https://support.perdoo.com/en/articles/3629954-api'

/**
 * Relay-style connection page size. Perdoo defaults to 20; we request
 * 100 per page to reduce round-trips. No published hard maximum.
 */
export const DEFAULT_PAGE_SIZE = 100
