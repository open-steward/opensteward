/**
 * HelpSpot API client.
 *
 * HelpSpot is self-hosted: each tenant has their own base URL stored in
 * credentials.extra.baseUrl (e.g. https://helpspot.mycompany.com/helpspot).
 *
 * The API endpoint is <baseUrl>/api/index.php with:
 *   - method=<methodName> query param
 *   - output=json query param
 *   - Authorization: Bearer <apiKey> header
 *
 * All GET calls go through `query()`. POST calls go through `post()`.
 * Retries on 429 and 5xx with exponential back-off.
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_PATH, OUTPUT_FORMAT } from './constants'

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

export class HelpspotClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const extra = (credentials.extra ?? {}) as Record<string, string>
    const baseUrl = (extra['baseUrl'] ?? '').replace(/\/+$/, '')
    this.http = axios.create({
      baseURL: baseUrl,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  /**
   * Execute a GET-style API method.
   * @param method  HelpSpot method name, e.g. 'private.request.get'
   * @param params  Additional query parameters
   */
  async query<T>(method: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(API_PATH, {
        params: { method, output: OUTPUT_FORMAT, ...params },
      })
      return data
    })
  }

  /**
   * Execute a POST-style API method (e.g. create/update).
   * @param method  HelpSpot method name
   * @param body    Form fields as object
   */
  async post<T>(method: string, body?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const form = new URLSearchParams()
      form.set('method', method)
      form.set('output', OUTPUT_FORMAT)
      for (const [k, v] of Object.entries(body ?? {})) {
        if (v !== undefined && v !== null) form.set(k, String(v))
      }
      const { data } = await this.http.post<T>(API_PATH, form.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
      return data
    })
  }
}
