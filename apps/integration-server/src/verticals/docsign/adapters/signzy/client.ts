/**
 * Signzy Contract360 REST API client.
 *
 * Authentication: a static access token sent verbatim in the `Authorization`
 * header (never `Authorization: Bearer`). The host (production vs
 * pre-production) is resolved from `credentials.extra.baseUrl`; all resource
 * paths nest under `${baseUrl}/api/${API_VERSION}/...`. JSON request/response
 * bodies.
 *
 * Contract360 reads are POST-with-body (the contract id travels in the request
 * body, not the path or query), so the only verb the adapter needs is `post`.
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_VERSION, AUTH_HEADER, DEFAULT_HOST } from './constants'

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

export class SignzyClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const host = String(credentials.extra?.['baseUrl'] ?? DEFAULT_HOST).replace(/\/+$/, '')
    const accessToken = String(credentials.accessToken ?? '')
    this.http = axios.create({
      baseURL: `${host}/api/${API_VERSION}`,
      headers: {
        [AUTH_HEADER]: accessToken,
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  async post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body, {
        headers: { 'Content-Type': 'application/json' },
      })
      return data
    })
  }
}
