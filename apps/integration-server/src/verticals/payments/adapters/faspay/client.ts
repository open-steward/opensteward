/**
 * Faspay Business / Online-Debit REST client — thin axios wrapper.
 *
 * Faspay has no token header: every call is a JSON `POST` whose body carries a
 * per-request `signature` (see `auth.ts`). There are no collection / list
 * endpoints for transactions — a transaction is created via `POST /cvr/100001/10`,
 * read back via `POST /cvr/100004/10`, and cancelled via `POST /cvr/100003/10` —
 * so this client exposes only `post`. The host is environment-specific and
 * resolved from the connection's stored environment.
 *
 * Docs: https://docs.faspay.co.id/merchant-integration/api-reference-1/debit-transaction
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { baseUrlForEnvironment } from './constants'
import { environment } from './auth'

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const status = (err as AxiosError).response?.status
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

export class FaspayClient {
  private http: AxiosInstance

  constructor(credentials: Credentials, baseUrl?: string) {
    this.http = axios.create({
      baseURL: baseUrl ?? baseUrlForEnvironment(environment(credentials)),
      headers: {
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
