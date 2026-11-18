/**
 * Foxit eSign (the rebranded eSignGenie) REST API constants.
 *
 * Foxit eSign authenticates with a static API key supplied as a Bearer
 * token. There is no OAuth handshake — the customer pastes the key into
 * the Connect Link form, and the adapter wraps it as `accessToken`.
 *
 * Docs: https://docs.esigngenie.com/
 */
export const API_BASE_URL = 'https://api.esigngenie.com/rest/v1'

export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 100

/**
 * Foxit eSign is API-key auth; scopes are not meaningful. The constant is
 * kept so the index file matches the DocuSign shape one-for-one.
 */
export const DEFAULT_SCOPES: string[] = []

/**
 * The documented Foxit eSign API host. "API Environments and Base URLs" →
 * "eSign APIs" → "US Server ... https://na1.foxitesign.foxit.com/api"
 * (https://docs.developer-api.foxit.com/), and the first `servers` entry of
 * the vendor's OpenAPI (https://developers.foxitesign.foxit.com/). The EU,
 * AU and CA servers (eu1 / au1 / na2) are not selectable: the connection
 * form collects no region. Only the rebuilt per-envelope reads use it;
 * the older methods still call API_BASE_URL.
 */
export const ESIGN_API_BASE_URL = 'https://na1.foxitesign.foxit.com/api'
