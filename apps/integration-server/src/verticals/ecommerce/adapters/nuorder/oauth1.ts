/**
 * OAuth 1.0a (RFC 5849) HMAC-SHA1 request signing for NuORDER.
 *
 * NuORDER signs every request with a static, per-brand two-legged OAuth 1.0a
 * credential set (no request-token/access-token dance — the four values are
 * generated once in Brand Admin → Settings → API Management and used
 * directly): consumer key, consumer secret, token, token secret. Verified
 * against https://assets.nuorder.com/api-docs/index.html, which shows the
 * signed header verbatim as:
 *
 *   Authorization: OAuth oauth_consumer_key='...',oauth_timestamp='...',
 *     oauth_nonce='...',oauth_version='1.0',oauth_signature_method='HMAC-SHA1',
 *     oauth_token='',oauth_signature='...'
 *
 * i.e. the oauth_* parameters travel in the `Authorization` header (not the
 * query string), signature method HMAC-SHA1, version "1.0". Repo-wide search
 * (`grep -rln "oauth_signature" apps/integration-server/src packages/shared/src`)
 * found no existing OAuth 1.0a signer to reuse — this is a from-scratch RFC
 * 5849 implementation. JSON request bodies are NOT form-urlencoded, so per
 * RFC 5849 §3.4.1.3 they are excluded from the signature base string — only
 * the oauth_* parameters and the URL's own query string parameters are
 * signed.
 */
import { createHmac, randomBytes } from 'node:crypto'

export interface Oauth1Credentials {
  consumerKey: string
  consumerSecret: string
  token: string
  tokenSecret: string
}

/** RFC 3986 percent-encoding — stricter than `encodeURIComponent`, which leaves `!*'()` unescaped. */
export function percentEncode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!*'()]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  )
}

function nonce(): string {
  return randomBytes(16).toString('hex')
}

/**
 * Build the RFC 5849 §3.4.1 signature base string from the method, the base
 * URL (no query string), and every parameter to be signed (oauth_* plus any
 * URL query parameters — NOT the JSON body).
 */
export function buildBaseString(
  method: string,
  baseUrl: string,
  params: Record<string, string>,
): string {
  const normalized = Object.keys(params)
    .sort()
    .map((k) => `${percentEncode(k)}=${percentEncode(params[k]!)}`)
    .join('&')
  return [method.toUpperCase(), percentEncode(baseUrl), percentEncode(normalized)].join('&')
}

export function signingKey(consumerSecret: string, tokenSecret: string): string {
  return `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`
}

export function computeSignature(baseString: string, consumerSecret: string, tokenSecret: string): string {
  return createHmac('sha1', signingKey(consumerSecret, tokenSecret)).update(baseString).digest('base64')
}

/**
 * Build the full `Authorization: OAuth ...` header value for one request.
 *
 * @param queryParams URL query-string parameters (included in the signature
 *   per RFC 5849); JSON body fields are never included — see file header.
 */
export function buildAuthorizationHeader(
  method: string,
  url: string,
  credentials: Oauth1Credentials,
  queryParams: Record<string, string> = {},
  overrides?: { nonce?: string; timestamp?: string },
): string {
  const parsed = new URL(url)
  const baseUrl = `${parsed.protocol}//${parsed.host}${parsed.pathname}`
  const urlQueryParams: Record<string, string> = {}
  for (const [k, v] of parsed.searchParams) urlQueryParams[k] = v

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: credentials.consumerKey,
    oauth_token: credentials.token,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: overrides?.timestamp ?? String(Math.floor(Date.now() / 1000)),
    oauth_nonce: overrides?.nonce ?? nonce(),
    oauth_version: '1.0',
  }

  const allParams = { ...oauthParams, ...urlQueryParams, ...queryParams }
  const baseString = buildBaseString(method, baseUrl, allParams)
  const signature = computeSignature(baseString, credentials.consumerSecret, credentials.tokenSecret)

  const headerParams: Record<string, string> = { ...oauthParams, oauth_signature: signature }
  const header = Object.keys(headerParams)
    .map((k) => `${percentEncode(k)}="${percentEncode(headerParams[k]!)}"`)
    .join(',')
  return `OAuth ${header}`
}
