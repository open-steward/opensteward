/**
 * Ecwid REST API constants.
 *
 * Ecwid (Lightspeed eCom) exposes a RESTful API under
 * `https://app.ecwid.com/api/v3/{storeId}/`. Authentication is via a
 * secret API token passed in the `Authorization: Bearer {token}` header.
 *
 * Docs: https://developer.ecwid.com/
 */
export const API_BASE = 'https://app.ecwid.com/api/v3'

export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 100
