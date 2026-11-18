import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_VERSION, DEFAULT_ENVIRONMENT, HOSTS, type CashfreeEnvironment } from './constants'

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
 * Cashfree PG REST client.
 *
 * Auth is a static header triple (`x-client-id` + `x-client-secret` +
 * `x-api-version`) attached to every request — no bearer token, no refresh.
 * The API is resource-scoped under an order: there is no cursor/offset list
 * pagination for the order-scoped sub-collections (payments, refunds), so
 * the client is a thin GET/POST wrapper.
 */
export class CashfreeClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const extra = (credentials.extra as Record<string, unknown> | undefined) ?? {}
    const env = (extra.environment as CashfreeEnvironment) ?? DEFAULT_ENVIRONMENT
    const clientId = String(extra.clientId ?? '')
    this.http = axios.create({
      baseURL: HOSTS[env] ?? HOSTS[DEFAULT_ENVIRONMENT],
      headers: {
        'x-client-id': clientId,
        'x-client-secret': credentials.accessToken,
        'x-api-version': API_VERSION,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => (await this.http.get<T>(path, { params })).data)
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => (await this.http.post<T>(path, body)).data)
  }
}
