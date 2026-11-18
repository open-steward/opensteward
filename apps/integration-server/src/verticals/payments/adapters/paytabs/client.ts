/**
 * PayTabs PT2 REST API client — thin axios wrapper.
 *
 * Auth: the merchant Server Key is sent verbatim as the `authorization` header
 * value (no `Bearer` prefix). Bodies and responses are JSON. PayTabs has no
 * collection / list endpoints in the PT2 transaction API — a transaction is
 * created or mutated via `POST /payment/request` and read back via
 * `POST /payment/query` — so this client exposes only `post`. The host is
 * region-specific and resolved from the connection's stored region.
 *
 * Docs: https://docs.paytabs.com/ (PT2 API Endpoints)
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { baseUrlForRegion } from './constants'
import { serverKey, region } from './auth'

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const status = (err as AxiosError).response?.status
      if ((status === 429 || (status !== undefined && status >= 500 && status < 600)) && i < retries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

export class PaytabsClient {
  private http: AxiosInstance

  constructor(credentials: Credentials, baseUrl?: string) {
    this.http = axios.create({
      baseURL: baseUrl ?? baseUrlForRegion(region(credentials)),
      headers: {
        // PayTabs sends the Server Key raw, with no scheme prefix.
        authorization: serverKey(credentials),
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    })
  }

  async post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => (await this.http.post<T>(path, body ?? {})).data)
  }
}
