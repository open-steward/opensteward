/**
 * Manager auth helpers.
 *
 * Manager uses API-key authentication (X-API-KEY header); there is no OAuth2
 * flow for the REST API.  The adapter uses the `simpleApiKey` credential
 * template from @opensteward/shared so the Connect Link flow renders a single
 * password field.
 *
 * `credentials.accessToken` holds the Manager API token.
 * `credentials.tenantId`   holds the business slug (e.g. "northwind" from
 *                           https://northwind.manager.io).
 */
import type { Credentials } from '../../adapter/interface'

/** No-op — Manager has no OAuth redirect flow. */
export function getAuthUrl(_state: string): string {
  return '#'
}

/**
 * "Exchange" for the API-key flow: the caller passes `apiKey[:businessSlug]`
 * as the "code".  The part before the first colon becomes the token; the part
 * after (if present) becomes the tenantId / business slug.
 */
export async function exchangeCode(code: string): Promise<Credentials> {
  const colonIdx = code.indexOf(':')
  if (colonIdx === -1) {
    return { accessToken: code.trim() }
  }
  const apiKey = code.slice(0, colonIdx).trim()
  const businessSlug = code.slice(colonIdx + 1).trim()
  return { accessToken: apiKey, tenantId: businessSlug || undefined }
}

/** API keys do not expire — return credentials unchanged. */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}
