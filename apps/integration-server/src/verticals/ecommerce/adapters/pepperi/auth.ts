/**
 * Pepperi authentication.
 *
 * Pepperi has no OAuth authorization-code flow. Instead:
 *
 *   1. `GET /company/apitoken`, HTTP Basic auth with the Pepperi ADMIN
 *      user's email + password, returns a long-lived `APIToken` and a
 *      `BaseURI` ("must be saved by you for the use of all API future
 *      requests" — the account may be hosted on a Pepperi cloud server
 *      other than the default `api.pepperi.com`).
 *   2. Every subsequent request uses HTTP Basic auth with username
 *      `TokenAuth` and the `APIToken` as the password, PLUS an
 *      `X-Pepperi-ConsumerKey` header carrying the calling app's consumer
 *      key: "Start making API requests using user name 'TokenAuth' and
 *      your API Token as password + Your App Consumer Key as the
 *      X-Pepperi-ConsumerKey header value."
 *
 * Docs:
 *  - https://developer.pepperi.com/introduction/
 *  - https://developer.pepperi.com/first-steps/authentication/
 *  - https://developer.pepperi.com/api-reference/company-resource/get-company-api-token/
 *    (confirms the method is GET, not POST, and that this same endpoint
 *    accepts either admin email/password OR TokenAuth/APIToken — the latter
 *    is how a token is rotated)
 *
 * We only ever call it with the admin email/password form, and store just
 * the resulting `APIToken` — never the admin password.
 */
import axios from 'axios'
import { DEFAULT_BASE_URL } from './constants'

export interface PepperiTokenResult {
  apiToken: string
  /** Per-account API host, when the platform returned one. */
  baseUri?: string
}

interface RawApiTokenResponse {
  APIToken?: string
  ApiToken?: string
  apiToken?: string
  BaseURI?: string
  BaseUri?: string
  baseUri?: string
  [key: string]: unknown
}

/**
 * Exchange the Pepperi ADMIN user's email + password for a company APIToken.
 *
 * The admin password is used only for this one HTTP Basic-authenticated
 * request and is never persisted — the caller (`exchangeCredentials`) stores
 * only the returned `apiToken`.
 */
export async function fetchApiToken(
  email: string,
  password: string,
  baseUrl: string = DEFAULT_BASE_URL,
): Promise<PepperiTokenResult> {
  const basic = Buffer.from(`${email}:${password}`).toString('base64')
  let data: RawApiTokenResponse
  try {
    const res = await axios.get<RawApiTokenResponse>(`${baseUrl}/company/apitoken`, {
      headers: {
        Authorization: `Basic ${basic}`,
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
    data = res.data
  } catch (err) {
    const status = (err as { response?: { status?: number } })?.response?.status
    throw new Error(
      `Pepperi apitoken request failed${status ? ` with HTTP ${status}` : ''} — check the ` +
        'admin email and password.',
      { cause: err },
    )
  }

  const apiToken = data.APIToken ?? data.ApiToken ?? data.apiToken
  if (!apiToken) {
    throw new Error(
      'Pepperi apitoken response did not include an APIToken field. ' +
        'See https://developer.pepperi.com/api-reference/company-resource/get-company-api-token/',
    )
  }
  const baseUri = data.BaseURI ?? data.BaseUri ?? data.baseUri
  return { apiToken: String(apiToken), baseUri: baseUri ? String(baseUri) : undefined }
}

/** Informational link only — Pepperi has no functional OAuth authorize URL. */
export function buildAuthUrl(): string {
  return 'https://developer.pepperi.com/first-steps/authentication/'
}
