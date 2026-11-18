/**
 * Deck Commerce auth.
 *
 * Deck Commerce uses a per-request HMAC-SHA256 token, not an OAuth2 flow, so
 * the Connect page collects these through credentialFields() — which it
 * renders for `api_key`, not `oauth2`.
 * Credentials required:
 *   - siteApiKey  : the site API secret (used to sign every request)
 *   - siteCode    : the Deck Commerce site code sent in every request body
 *   - apiBaseUrl  : the site's "Web API Url" (the vendor Magento module's name for it);
 *                   API names such as api/PimInventoryLookup are appended to it
 *
 * The token for each call is:
 *   UPPERCASE( HEX( sha256( lowercase(apiName) + currentTimestampUTC + siteApiKey ) ) )
 *
 * The base URL is free-form and every call to it carries a signed token, so it
 * is normalised, must be https, and must resolve to a public address
 * (`assertPublicHost`) before any request is sent to it.
 */
import { assertPublicHost } from '@opensteward/shared'
import type { Credentials, CredentialField } from '@opensteward/shared'

const URL_LABEL = 'Deck Commerce API base URL'

export function getAuthUrlUnsupported(): never {
  throw new Error('deck-commerce uses HMAC per-request tokens; use credentialFields() instead')
}

/**
 * Normalise a customer-typed base URL: trim, default the scheme to https,
 * require https, drop credentials/query/fragment and any trailing slash.
 */
export function normaliseDeckApiBaseUrl(raw: unknown): string {
  const value = typeof raw === 'string' ? raw.trim() : ''
  if (!value) throw new Error(`${URL_LABEL} is required (the site's Web API Url).`)
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    throw new Error(`${URL_LABEL} is not a valid URL.`)
  }
  if (url.protocol !== 'https:') throw new Error(`${URL_LABEL} must use https.`)
  if (url.username || url.password) throw new Error(`${URL_LABEL} must not contain credentials.`)
  if (!url.hostname.includes('.')) throw new Error(`${URL_LABEL} is not a valid URL.`)
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'apiBaseUrl',
      label: 'API base URL',
      type: 'url',
      helpText:
        'The Web API Url Deck Commerce issued for your site (https only), without the api/... API name.',
      required: true,
    },
    { name: 'siteCode', label: 'Site Code', type: 'text', required: true },
    { name: 'siteApiKey', label: 'Site API Key', type: 'password', required: true },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const apiBaseUrl = normaliseDeckApiBaseUrl(fields['apiBaseUrl'])
  const siteCode = (fields['siteCode'] ?? '').trim()
  const siteApiKey = (fields['siteApiKey'] ?? '').trim()
  if (!siteCode) throw new Error('Site code is required.')
  if (!siteApiKey) throw new Error('Site API key is required.')
  // Fail at connect time rather than on the first signed request.
  await assertPublicHost(new URL(apiBaseUrl).hostname)
  return {
    // accessToken holds the siteApiKey; it is used at call-time to compute per-request tokens
    accessToken: siteApiKey,
    extra: { siteCode, apiBaseUrl },
  }
}
