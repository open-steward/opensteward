import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { baseUrlFor, integrationKey } from './auth'

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
 * EBANX Direct API client.
 *
 * Auth is body-based: every request carries the merchant `integration_key`
 * as a JSON field (no Authorization header). The host depends on the
 * connection's environment (sandbox vs production), resolved from the
 * stored credentials. Paging, where an endpoint has it (/ws/payout/search),
 * rides in the request body and is built by the adapter, not here.
 */
export class EbanxClient {
  private http: AxiosInstance
  private key: string

  constructor(credentials: Credentials) {
    this.key = integrationKey(credentials)
    this.http = axios.create({
      baseURL: baseUrlFor(credentials),
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    })
  }

  /** POST `body` to `path`, injecting `integration_key`. */
  async post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    const payload = { integration_key: this.key, ...(body ?? {}) }
    return withRetry(async () => (await this.http.post<T>(path, payload)).data)
  }
}
