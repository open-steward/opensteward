/**
 * PayU REST client — thin axios wrapper over the `/api/v2_1` surface.
 *
 * Auth is a bearer token (`Authorization: Bearer <access_token>`) minted from
 * the `client_credentials` grant (see `auth.ts`). Request + response bodies are
 * JSON. PayU has no cursor/offset list pagination on the order resources we
 * implement — orders are fetched by id and refunds are order-scoped — so the
 * client is a small GET/POST/DELETE wrapper.
 *
 * Note: GET on an order can answer 302 (redirect to the payment summary) when a
 * payment is still in progress; we disable redirect-following so the adapter
 * sees the JSON status instead of an HTML page.
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_PREFIX, DEFAULT_ENVIRONMENT, HOSTS, type PayuEnvironment } from './constants'
import { extraFrom } from './auth'

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

export class PayuClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const env: PayuEnvironment = extraFrom(credentials).environment
    this.http = axios.create({
      baseURL: `${HOSTS[env] ?? HOSTS[DEFAULT_ENVIRONMENT]}${API_PREFIX}`,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
      // A 302 on order GET is a valid status answer, not an error.
      maxRedirects: 0,
      validateStatus: (s) => (s >= 200 && s < 300) || s === 302,
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => (await this.http.get<T>(path, { params })).data)
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => (await this.http.post<T>(path, body)).data)
  }

  async delete<T>(path: string): Promise<T> {
    return withRetry(async () => (await this.http.delete<T>(path)).data)
  }
}
