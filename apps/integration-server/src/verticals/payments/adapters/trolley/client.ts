/**
 * Trolley REST client with request signing.
 *
 * Every request carries `Authorization: prsign ACCESS_KEY:REQUEST_SIGNATURE`
 * and `X-PR-Timestamp`. From https://developers.trolley.com/api/#authentication:
 *
 *   "The REQUEST_SIGNATURE is computed by creating a sha256 HMAC using the
 *    secret key on the prehash string and timestamp + '\n' + method + '\n' +
 *    requestPath + '\n' + body + '\n'"
 *
 *   - timestamp: "the seconds past 1970 (Unix Epoch) in UTC time", the same
 *     value as the `X-PR-Timestamp` header;
 *   - method: "The request method in all upper case.";
 *   - requestPath: "The full request path including all query parameters
 *     (e.g. /v1/recipients/?search=bob)";
 *   - body: "The JSON body of the request." (empty string for a GET).
 *
 * The query string and the body are serialised here, once, and that exact
 * text is both signed and sent, so the signature always covers the bytes on
 * the wire.
 */
import { createHmac } from 'node:crypto'
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL, API_VERSION_PREFIX } from './constants'
import { signingKeys } from './auth'

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const s = (err as AxiosError).response?.status
      if ((s === 429 || (s !== undefined && s >= 500)) && i < retries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

/** The two auth headers for one request. Exported to test the signing scheme. */
export function buildAuthHeaders(
  accessKey: string,
  secretKey: string,
  method: string,
  requestPath: string,
  body: string,
  timestamp: number,
): { Authorization: string; 'X-PR-Timestamp': string } {
  const message = `${timestamp}\n${method.toUpperCase()}\n${requestPath}\n${body}\n`
  const signature = createHmac('sha256', secretKey).update(message).digest('hex')
  return { Authorization: `prsign ${accessKey}:${signature}`, 'X-PR-Timestamp': String(timestamp) }
}

/** `path` plus its query string, skipping undefined values. */
export function withQuery(
  path: string,
  query?: Record<string, string | number | undefined>,
): string {
  if (!query) return path
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) if (v !== undefined) qs.append(k, String(v))
  const s = qs.toString()
  return s ? `${path}?${s}` : path
}

export class TrolleyClient {
  private http: AxiosInstance
  private readonly accessKey: string
  private readonly secretKey: string

  constructor(credentials: Credentials) {
    const keys = signingKeys(credentials)
    this.accessKey = keys.accessKey
    this.secretKey = keys.secretKey
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: { Accept: 'application/json' },
      timeout: 30_000,
    })
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const requestPath = `${API_VERSION_PREFIX}${path}`
    const payload = body === undefined ? '' : JSON.stringify(body)
    return withRetry(async () => {
      const headers: Record<string, string> = {
        ...buildAuthHeaders(
          this.accessKey,
          this.secretKey,
          method,
          requestPath,
          payload,
          Math.floor(Date.now() / 1000),
        ),
      }
      if (payload !== '') headers['Content-Type'] = 'application/json'
      const res = await this.http.request<T>({
        method,
        url: requestPath,
        headers,
        ...(payload !== '' ? { data: payload } : {}),
      })
      return res.data
    })
  }

  /** GET `path` (without the `/v1` prefix) with `query` appended and signed. */
  async get<T>(path: string, query?: Record<string, string | number | undefined>): Promise<T> {
    return this.request<T>('GET', withQuery(path, query))
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body)
  }

  async delete<T>(path: string): Promise<T> {
    return this.request<T>('DELETE', path)
  }
}
