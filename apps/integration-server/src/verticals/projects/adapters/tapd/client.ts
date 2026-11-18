/**
 * Thin HTTP client for the TAPD REST API.
 *
 * Authentication: HTTP Basic Auth using `apiUser:apiPassword` stored
 * together in `credentials.accessToken` (colon-separated). The client
 * splits the token on the first colon to construct the Basic Auth header.
 *
 * Response envelope:
 *   { "status": 1, "data": <array or object>, "info": "success" }
 *
 * Non-1 status values indicate errors; the client throws in that case.
 * List responses return `data` as an array of wrapped objects:
 *   [ { "Story": { ... } }, { "Story": { ... } } ]
 *
 * The `unwrapList` helper extracts the inner objects by the given key.
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL, MAX_RETRIES } from './constants'

async function withRetry<T>(fn: () => Promise<T>, retries = MAX_RETRIES): Promise<T> {
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

/** TAPD response envelope. */
interface TapdEnvelope<T> {
  status: number
  data: T
  info?: string
}

/**
 * Split `apiUser:apiPassword` stored in accessToken.
 * Falls back to treating the whole string as the user with an empty password.
 */
function parseBasicCredentials(accessToken: string): { user: string; password: string } {
  const idx = accessToken.indexOf(':')
  if (idx === -1) return { user: accessToken, password: '' }
  return { user: accessToken.slice(0, idx), password: accessToken.slice(idx + 1) }
}

export class TapdClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const { user, password } = parseBasicCredentials(credentials.accessToken ?? '')
    this.http = axios.create({
      baseURL: API_BASE_URL,
      auth: { username: user, password },
      headers: { Accept: 'application/json' },
      timeout: 30_000,
    })
  }

  /**
   * GET a TAPD endpoint and return the `data` field of the envelope.
   * Throws if `status !== 1`.
   */
  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data: envelope } = await this.http.get<TapdEnvelope<T>>(path, { params })
      if (envelope.status !== 1) {
        throw new Error(`TAPD API error on GET ${path}: ${envelope.info ?? String(envelope.status)}`)
      }
      return envelope.data
    })
  }

  /**
   * GET a TAPD list endpoint that wraps each item under a named key.
   * e.g. `[ { "Story": {...} }, ... ]` → unwrap with key = "Story"
   */
  async getList<T>(path: string, key: string, params?: Record<string, unknown>): Promise<T[]> {
    const items = await this.get<Array<Record<string, T>>>(path, params)
    if (!Array.isArray(items)) return []
    return items.map((item) => item[key]).filter(Boolean) as T[]
  }
}
