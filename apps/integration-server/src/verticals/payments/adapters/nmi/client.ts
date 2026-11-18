import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { HOSTS, QUERY_PATH, TRANSACT_PATH } from './constants'
import { environmentFrom, securityKeyFrom } from './auth'

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

/**
 * Parse the Payment API (`transact.php`) response. NMI returns the result as a
 * single URL-encoded query string, e.g.
 *   response=1&responsetext=SUCCESS&authcode=123456&transactionid=10778056102&response_code=100&type=sale
 */
export function parseTransactResponse(body: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of new URLSearchParams(body).entries()) out[k] = v
  return out
}

export class NmiClient {
  private http: AxiosInstance
  private securityKey: string

  constructor(credentials: Credentials) {
    this.securityKey = securityKeyFrom(credentials)
    this.http = axios.create({
      baseURL: HOSTS[environmentFrom(credentials)],
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'text/plain, application/xml, text/xml',
      },
      // transact.php + query.php both return text, never JSON.
      responseType: 'text',
      transformResponse: [(d) => d],
      timeout: 30_000,
    })
  }

  /**
   * Payment API — POST a single transaction operation to transact.php. The
   * `security_key` is injected automatically. Returns the flattened
   * key/value response map.
   */
  async transact(fields: Record<string, string | number | undefined>): Promise<Record<string, string>> {
    const body = new URLSearchParams({ security_key: this.securityKey })
    for (const [k, v] of Object.entries(fields)) {
      if (v === undefined || v === null) continue
      body.set(k, String(v))
    }
    return withRetry(async () => {
      const { data } = await this.http.post<string>(TRANSACT_PATH, body.toString())
      return parseTransactResponse(data)
    })
  }

  /**
   * Query API — POST a report request to query.php. The `security_key` is
   * injected automatically. Returns the raw XML body for the caller's
   * transform to parse.
   */
  async query(params: Record<string, string | number | undefined>): Promise<string> {
    const body = new URLSearchParams({ security_key: this.securityKey })
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null) continue
      body.set(k, String(v))
    }
    return withRetry(async () => {
      const { data } = await this.http.post<string>(QUERY_PATH, body.toString())
      return data
    })
  }
}
