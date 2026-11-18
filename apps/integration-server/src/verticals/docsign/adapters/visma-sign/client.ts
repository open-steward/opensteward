import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_ORIGIN, API_PATH_PREFIX } from './constants'
import { signVismaSignRequest, vismaSignKeys } from './auth'

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const axiosErr = err as AxiosError
      const status = axiosErr.response?.status
      if (
        (status === 429 || (status !== undefined && status >= 500 && status < 600)) &&
        i < retries
      ) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

/**
 * Every request is HMAC-signed over the exact path and query it sends, so the
 * query string is serialized here rather than by axios, and each retry is
 * re-signed with a fresh `Date`.
 */
export class VismaSignClient {
  private http: AxiosInstance
  private keys: { clientIdentifier: string; secret: string }

  constructor(credentials: Credentials) {
    this.keys = vismaSignKeys(credentials)
    this.http = axios.create({
      baseURL: API_ORIGIN,
      headers: { Accept: 'application/json' },
      timeout: 30_000,
    })
  }

  private async send<T>(
    method: 'GET' | 'POST',
    path: string,
    params?: Record<string, unknown>,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const query = new URLSearchParams()
    for (const [k, v] of Object.entries(params ?? {})) {
      if (v !== undefined && v !== null) query.append(k, String(v))
    }
    const qs = query.toString()
    const signedPath = `${API_PATH_PREFIX}${path}${qs ? `?${qs}` : ''}`
    const data = body === undefined ? '' : JSON.stringify(body)
    return withRetry(async () => {
      const headers = signVismaSignRequest({
        method,
        path: signedPath,
        body: data,
        date: new Date().toUTCString(),
        ...this.keys,
      })
      const res = await this.http.request<T>({
        method,
        url: signedPath,
        data,
        headers,
        // The body is already the exact string that was hashed.
        transformRequest: [(d: unknown) => d],
      })
      return res.data
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return this.send<T>('GET', path, params)
  }

  async post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    return this.send<T>('POST', path, undefined, body)
  }
}
