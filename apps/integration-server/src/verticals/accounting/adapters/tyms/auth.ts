/**
 * Tyms authentication — API key (`secret-key` header).
 *
 * Tyms authenticates via a static API key supplied in the `secret-key` header
 * on every request.  Keys are obtained from the Tyms Dashboard.
 * No OAuth flow is needed for the api_key integration model.
 */
import type { Credentials } from '../../adapter/interface'

/**
 * Converts a raw API key string into the Credentials shape used throughout
 * the adapter.  The key is stored in `accessToken` so the HTTP client can
 * read it from a single field.
 */
export function buildCredentials(apiKey: string): Credentials {
  return { accessToken: apiKey }
}
