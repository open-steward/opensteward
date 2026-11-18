/**
 * Falabella Seller Center (FSC) Action-RPC HTTP client.
 *
 * One host, one path (`/`), every call disambiguated by an `Action` query
 * parameter — `Format` is forced to `JSON`. Every call is signed per
 * https://developers.falabella.com/docs/signing-requests:
 *
 *   "The concatenated result of all the request parameters, ordered by
 *   name, including optional parameters, and excluding the Signature
 *   parameter." / "Names and values must be URL encoded according to RFC
 *   3986 standard, concatenated with the '=' character. Each parameter set
 *   (name=value) must be separated with the '&' character." / "The
 *   signature parameter that we require in all calls is the HMAC of the
 *   request string and your API key with the SHA256 digest algorithm."
 *
 * Confirmed PHP reference implementation from that page:
 *   $concatenated = implode('&', $encoded);
 *   $parameters['Signature'] = rawurlencode(hash_hmac('sha256', $concatenated, $api_key, false));
 *
 * `hash_hmac(..., false)` returns lowercase hex — this client matches that
 * exactly (Node's default `.digest('hex')` is also lowercase).
 *
 * The API key is used ONLY as the HMAC key, in memory — it is never placed
 * in a URL, header, or body, so it cannot appear in `err.config`/`err.request`
 * on a failed call. `call()` still never rethrows axios's own error object
 * (which carries the full signed request config) — it always constructs a
 * fresh `Error` from a status code and library message, so a caller that
 * logs the thrown error has nothing upstream-request-shaped to leak.
 *
 * Response envelope — confirmed verbatim from
 * https://developers.falabella.com/docs/products/getproducts (XML) and
 * https://developers.falabella.com/docs/orders/getorderitems (JSON):
 *   { "SuccessResponse": { "Head": {...}, "Body": { "<Plural>": { "<Singular>": T | T[] } } } }
 *   { "ErrorResponse": { "Head": { "ErrorCode", "ErrorMessage" } } }
 * A single result comes back as an object, not a one-element array — see
 * `toArray`.
 */
import axios, { type AxiosInstance } from 'axios'
import crypto from 'crypto'
import { withRetry } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL, API_VERSION, BUSINESS_UNIT_BY_COUNTRY, type FalabellaCountry } from './constants'

/** RFC 3986 percent-encoding — `encodeURIComponent` alone leaves `!'()*` unescaped. */
export function rfc3986Encode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase(),
  )
}

/**
 * Sign a Falabella request per the documented algorithm: sort every
 * parameter except `Signature` by name, RFC-3986-encode each name and
 * value, join as `name=value` pairs with `&`, then hex HMAC-SHA256 with the
 * API key.
 */
export function signFalabellaRequest(params: Record<string, string>, apiKey: string): string {
  const sorted = Object.keys(params)
    .filter((k) => k !== 'Signature')
    .sort()
  const joined = sorted.map((k) => `${rfc3986Encode(k)}=${rfc3986Encode(params[k]!)}`).join('&')
  return crypto.createHmac('sha256', apiKey).update(joined).digest('hex')
}

/**
 * `SELLER_ID/TECNOLOGÍA_USADA/VERSIÓN_TECNOLOGÍA/TIPO_INTEGRACIÓN/CÓDIGO_UNIDAD_DE_NEGOCIO`
 * per https://developers.falabella.com/docs/operate-with-apis. OpenSteward
 * is a third-party integrator, so `TIPO_INTEGRACIÓN` is its own name (the
 * docs' own example for this case: `MYINTEGRATOR`, not `PROPIA`).
 */
export function buildUserAgent(sellerId: string, businessUnit: string): string {
  return `${sellerId}/Node.js/${process.versions.node}/OPENSTEWARD/${businessUnit}`
}

/** XML→JSON conversion collapses a single repeated element to a bare object, not a 1-item array. */
export function toArray<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return []
  return Array.isArray(value) ? value : [value]
}

interface FalabellaErrorHead {
  ErrorCode?: string | number
  ErrorMessage?: string
}

interface FalabellaEnvelope<T> {
  SuccessResponse?: { Body?: T }
  ErrorResponse?: { Head?: FalabellaErrorHead }
}

/**
 * Never rethrow axios's own error — it carries the full signed request
 * config (URL, params, headers). Always construct a fresh `Error` from a
 * status code and library message so nothing upstream-request-shaped
 * reaches a caller's logs.
 */
function sanitizeError(err: unknown): Error {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status
    return new Error(`Falabella request failed${status ? ` (HTTP ${status})` : ''}: ${err.message}`)
  }
  return err instanceof Error ? err : new Error(String(err))
}

export interface FalabellaCallOptions {
  method?: 'GET' | 'POST'
  /** Raw XML body for write actions (ProductCreate/ProductUpdate/UpdateStock/...). */
  body?: string
}

export class FalabellaClient {
  private http: AxiosInstance
  private userId: string
  private apiKey: string
  private userAgent: string

  constructor(credentials: Credentials) {
    const userId = credentials.extra?.['userId'] as string | undefined
    const apiKey = credentials.accessToken
    const sellerId = credentials.extra?.['sellerId'] as string | undefined
    const country = credentials.extra?.['country'] as FalabellaCountry | undefined
    if (!userId) throw new Error('FalabellaClient: credentials.extra.userId is required.')
    if (!apiKey) throw new Error('FalabellaClient: credentials.accessToken (the API key) is required.')
    if (!sellerId) throw new Error('FalabellaClient: credentials.extra.sellerId is required.')
    if (!country || !(country in BUSINESS_UNIT_BY_COUNTRY)) {
      throw new Error(
        `FalabellaClient: credentials.extra.country must be one of ${Object.keys(BUSINESS_UNIT_BY_COUNTRY).join(', ')}.`,
      )
    }
    this.userId = userId
    this.apiKey = apiKey
    this.userAgent = buildUserAgent(sellerId, BUSINESS_UNIT_BY_COUNTRY[country])
    this.http = axios.create({ baseURL: API_BASE_URL, timeout: 30_000 })
  }

  /** Every non-`Signature` parameter this call needs, ready to be signed. */
  private baseParams(action: string, extra: Record<string, string>): Record<string, string> {
    return {
      Action: action,
      Format: 'JSON',
      Timestamp: new Date().toISOString(),
      UserID: this.userId,
      Version: API_VERSION,
      ...extra,
    }
  }

  async call<T>(
    action: string,
    params: Record<string, string> = {},
    opts: FalabellaCallOptions = {},
  ): Promise<T> {
    // `withRetry` needs the RAW axios error (its `.response.status`) to
    // detect a retryable 429 — sanitizing happens once, only at this
    // outermost boundary, after retries are exhausted or a non-HTTP error
    // (e.g. the ErrorResponse case below) is thrown.
    try {
      return await withRetry(async () => {
        const unsigned = this.baseParams(action, params)
        const signature = signFalabellaRequest(unsigned, this.apiKey)
        const query = { ...unsigned, Signature: signature }
        const { data } = await this.http.request<FalabellaEnvelope<T>>({
          url: '/',
          method: opts.method ?? 'GET',
          params: query,
          headers: {
            'User-Agent': this.userAgent,
            ...(opts.body ? { 'Content-Type': 'text/xml' } : {}),
          },
          data: opts.body,
        })
        if (data.ErrorResponse) {
          const head = data.ErrorResponse.Head
          throw new Error(`Falabella API error ${head?.ErrorCode ?? ''}: ${head?.ErrorMessage ?? 'unknown error'}`)
        }
        if (!data.SuccessResponse) {
          throw new Error(`Falabella API: response had neither SuccessResponse nor ErrorResponse for ${action}`)
        }
        return data.SuccessResponse.Body as T
      })
    } catch (err) {
      throw sanitizeError(err)
    }
  }
}
