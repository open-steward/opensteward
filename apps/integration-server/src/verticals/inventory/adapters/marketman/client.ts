/**
 * MarketMan API v3 HTTP client.
 *
 * All requests carry the AUTH_TOKEN header obtained via GetToken.
 * The token can expire; refreshCredentials() in index.ts re-acquires it.
 * All endpoints are POST with a JSON body containing BuyerGuid + params.
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL } from './constants'

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const axiosErr = err as AxiosError
      const status = axiosErr.response?.status
      if ((status === 429 || (status !== undefined && status >= 500 && status < 600)) && i < retries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

/** The status fields every documented MarketMan response carries. */
interface MarketmanEnvelope {
  IsSuccess?: boolean | null
  ErrorMessage?: string | null
  ErrorCode?: number | string | null
}

/**
 * MarketMan refused the call in its response body, over HTTP 200.
 *
 * MarketMan reports application errors in the body, not in the status: its
 * docs' "API Limitations" gives the daily quota notice as `{ "IsSuccess":
 * false, "ErrorMessage": "Reached max calls" }`, and the collection's own
 * examples answer `200 OK` with `IsSuccess: false` (GetToken "Wrong
 * credentials", SetSales "Buyer doesn't have an api pos defined"). Such a
 * body has no `Items`/`Orders`/… key, so read as a list it is an empty last
 * page, and a sync would have marked a truncated collection complete on it.
 *
 * Shaped like an axios error (`response` + `config`) so the `/v1` error
 * handler answers 502 UPSTREAM_ERROR with the platform's message, rather
 * than 500 INTERNAL. `config` carries only the method and path: no headers,
 * so no AUTH_TOKEN.
 */
export class MarketmanApiError extends Error {
  readonly response: { status: number; data: unknown }
  readonly config: { method: 'post'; url: string }

  constructor(path: string, status: number, body: MarketmanEnvelope) {
    const code = body.ErrorCode == null ? '' : ` (ErrorCode ${body.ErrorCode})`
    super(`marketman ${path} failed: ${body.ErrorMessage ?? 'IsSuccess false'}${code}`)
    this.name = 'MarketmanApiError'
    this.response = { status, data: body }
    this.config = { method: 'post', url: path }
  }
}

export class MarketmanClient {
  private http: AxiosInstance
  readonly buyerGuid: string

  constructor(credentials: Credentials) {
    const token = credentials.accessToken
    if (!token) throw new Error('marketman requires credentials.accessToken (AUTH_TOKEN)')
    this.buyerGuid = String(credentials.extra?.['buyerGuid'] ?? '')
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        AUTH_TOKEN: token,
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    })
  }

  /**
   * All MarketMan v3 endpoints are HTTP POST with JSON body.
   * BuyerGuid is injected automatically when it is non-empty.
   * A body with `IsSuccess: false` throws {@link MarketmanApiError}.
   */
  async post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    const payload: Record<string, unknown> = {}
    if (this.buyerGuid) payload['BuyerGuid'] = this.buyerGuid
    if (body) Object.assign(payload, body)
    const { status, data } = await withRetry(() => this.http.post<T>(path, payload))
    const envelope = data as MarketmanEnvelope | null | undefined
    if (envelope !== null && typeof envelope === 'object' && envelope.IsSuccess === false) {
      throw new MarketmanApiError(path, status, envelope)
    }
    return data
  }
}
