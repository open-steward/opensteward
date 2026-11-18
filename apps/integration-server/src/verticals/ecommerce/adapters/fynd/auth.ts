/**
 * Fynd Platform API auth — OAuth2 **authorization-code** flow, scoped to one
 * company.
 *
 * This is the one place this rebuild disagrees with the task brief that
 * kicked it off: the brief assumed client-credentials auth. The official
 * SDK proves otherwise. `sdk/platform/OAuthClient.js` in
 * `gofynd/fdk-client-javascript` @ commit
 * `7598488bf04e7a75bc44088441745538d524abec` (2026-09-10) only ever calls
 * the token endpoint with `grant_type=authorization_code` (interactive
 * install, driven by a company-panel login + redirect) or
 * `grant_type=refresh_token`. `client_credentials` exists ONLY in the
 * separate, organization-scoped **Partner** API (`sdk/partner/OAuthClient.js`)
 * used for agency/extension management, not for the per-company Catalog /
 * Order / Cart / User / CompanyProfile modules this adapter calls. So:
 * `auth_type: 'oauth2'` on the central platform registry is already correct
 * and needs no change — this is a standard authorize-redirect + code-exchange
 * flow, except the authorize URL must additionally be signed (see
 * `signAuthorizeQuery` below).
 *
 * Flow:
 *  1. `GET {domain}/service/panel/authentication/v1.0/company/{companyId}/oauth/authorize`
 *     — company-panel login + consent; redirects back with `?code=`.
 *     (`sdk/platform/OAuthClient.js#startAuthorization`)
 *  2. `POST {domain}/service/panel/authentication/v1.0/company/{companyId}/oauth/token`
 *     — `Authorization: Basic base64(clientId:clientSecret)`,
 *     `Content-Type: application/x-www-form-urlencoded`,
 *     body `grant_type=authorization_code&code=...` (or
 *     `grant_type=refresh_token&refresh_token=...`).
 *     (`sdk/platform/OAuthClient.js#getAccesstokenObj`)
 *
 * `companyId` and `applicationId` are the customer's, not this deployment's —
 * collected via `oauthFields()` before the redirect and read back from
 * `credentials.extra` at request time.
 */

import { createHash, createHmac } from 'node:crypto'
import axios, { type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { FYND_DOMAIN } from './constants'

const AUTHORIZE_PATH = (companyId: string): string =>
  `/service/panel/authentication/v1.0/company/${encodeURIComponent(companyId)}/oauth/authorize`

const TOKEN_PATH = (companyId: string): string =>
  `/service/panel/authentication/v1.0/company/${encodeURIComponent(companyId)}/oauth/token`

// ── Authorize-URL signing ────────────────────────────────────────────────
//
// Fynd's own OAuthClient signs the authorize request's query string with
// `@gofynd/fp-signature` (the SDK's pinned range is `^1.0.1`). That
// package's `sign(request, options)` (dist/cjs/index.js) defaults
// `options.secret` to the literal string `'1234567'` when the caller does
// not pass one — and `OAuthClient.js#startAuthorization` calls
// `sign(signingOptions, { signQuery: true })` without a `secret`, so EVERY
// installation of the official SDK signs the authorize redirect with that
// same hardcoded default, not the integration's real `apiSecret`. That is
// reproduced verbatim below rather than "fixed", because matching the
// widely-deployed official behaviour is the only way to be verified against
// an official source — a "corrected" signature would be an invention.
//
// Algorithm ("v1.1", from `@gofynd/fp-signature@1.0.1`
// `dist/cjs/RequestSigner.js`), specialised to a query-only, bodyless,
// header-less GET (which is all `startAuthorization` ever produces):
//
//   canonicalString = [
//     "GET",
//     path,                                  // no query string
//     sortedQuery,                           // "k=v&k2=v2", keys sorted,
//                                             // values NOT percent-encoded
//                                             // (the package's own
//                                             // `encodeRfc3986Full` is a
//                                             // documented no-op in 1.0.1)
//     "host:" + host + "\n",                 // canonicalHeaders + "\n"
//     "host",                                // signedHeaders
//     sha256("").hex,                        // body hash of an empty body
//   ].join("\n")
//   stringToSign = [xFpDate, sha256(canonicalString).hex].join("\n")
//   signature = "v1.1:" + hmacSha256(DEFAULT_SECRET, stringToSign).hex
//
// `xFpDate` is `new Date().toISOString()` with `-`, `:` and the
// milliseconds fraction stripped (`RequestSigner.js#getDateTime`).
const FP_SIGNATURE_DEFAULT_SECRET = '1234567'

function fpDateNow(): string {
  return new Date().toISOString().replace(/[:-]|\.\d{3}/g, '')
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

function hmacSha256Hex(key: string, input: string): string {
  return createHmac('sha256', key).update(input).digest('hex')
}

/**
 * Sign a Fynd authorize-URL query for the `oauth/authorize` GET redirect.
 * Returns the two extra params the SDK appends to the URL.
 */
export function signAuthorizeQuery(
  host: string,
  path: string,
  query: Record<string, string>,
): { 'x-fp-date': string; 'x-fp-signature': string } {
  const xFpDate = fpDateNow()
  const fullQuery: Record<string, string> = { ...query, 'x-fp-date': xFpDate }
  const sortedQueryStr = Object.keys(fullQuery)
    .sort()
    .map((k) => `${k}=${fullQuery[k]}`)
    .join('&')
  const canonicalHeaders = `host:${host}`
  const signedHeaders = 'host'
  const bodyHash = sha256Hex('')
  const canonicalRequest = ['GET', path, sortedQueryStr, `${canonicalHeaders}\n`, signedHeaders, bodyHash].join(
    '\n',
  )
  const stringToSign = [xFpDate, sha256Hex(canonicalRequest)].join('\n')
  const signature = `v1.1:${hmacSha256Hex(FP_SIGNATURE_DEFAULT_SECRET, stringToSign)}`
  return { 'x-fp-date': xFpDate, 'x-fp-signature': signature }
}

export function buildAuthorizeUrl(
  companyId: string,
  clientId: string,
  redirectUri: string,
  scopes: string[],
  state: string,
  domain: string = FYND_DOMAIN,
): string {
  const path = AUTHORIZE_PATH(companyId)
  const query: Record<string, string> = {
    client_id: clientId,
    scope: scopes.join(','),
    redirect_uri: redirectUri,
    state,
    response_type: 'code',
  }
  const host = new URL(domain).host
  const signed = signAuthorizeQuery(host, path, query)
  const url = new URL(path, domain)
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v)
  url.searchParams.set('x-fp-date', signed['x-fp-date'])
  url.searchParams.set('x-fp-signature', signed['x-fp-signature'])
  return url.toString()
}

interface FyndTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
  token_type?: string
  scope?: string
}

function basicAuthHeader(clientId: string, clientSecret: string): string {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
}

async function requestToken(
  companyId: string,
  clientId: string,
  clientSecret: string,
  body: Record<string, string>,
  domain: string,
): Promise<Credentials> {
  const url = `${domain}${TOKEN_PATH(companyId)}`
  try {
    const res = await axios.post<FyndTokenResponse>(url, new URLSearchParams(body).toString(), {
      headers: {
        Authorization: basicAuthHeader(clientId, clientSecret),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      timeout: 30_000,
    })
    if (!res.data.access_token) {
      throw new Error('Fynd token endpoint returned an empty access_token')
    }
    return {
      accessToken: res.data.access_token,
      refreshToken: res.data.refresh_token,
      expiresAt:
        typeof res.data.expires_in === 'number'
          ? new Date(Date.now() + res.data.expires_in * 1000)
          : undefined,
      scope: res.data.scope,
    }
  } catch (err) {
    const axiosErr = err as AxiosError<{ message?: string }>
    if (axiosErr.isAxiosError) {
      const status = axiosErr.response?.status
      const message = axiosErr.response?.data?.message ?? axiosErr.message
      throw new Error(`Fynd token endpoint returned ${status ?? '(no response)'}: ${message}`, { cause: err })
    }
    throw err
  }
}

/** Exchange an authorization code for a company-scoped token. */
export function exchangeCode(
  companyId: string,
  code: string,
  clientId: string,
  clientSecret: string,
  domain: string = FYND_DOMAIN,
): Promise<Credentials> {
  return requestToken(companyId, clientId, clientSecret, { grant_type: 'authorization_code', code }, domain)
}

/** Refresh a company-scoped token. */
export function refreshToken(
  companyId: string,
  refreshTokenValue: string,
  clientId: string,
  clientSecret: string,
  domain: string = FYND_DOMAIN,
): Promise<Credentials> {
  return requestToken(
    companyId,
    clientId,
    clientSecret,
    { grant_type: 'refresh_token', refresh_token: refreshTokenValue },
    domain,
  )
}
