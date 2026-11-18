/**
 * Vipps MobilePay API client — thin axios wrapper.
 *
 * Every request carries the merchant's Bearer access token plus the
 * subscription key, merchant serial number and the `Vipps-System-*` headers.
 * Mutating POSTs (capture / refund / cancel / create) additionally require a
 * unique `Idempotency-Key` so retries don't double-apply — the client mints a
 * UUID per POST unless the caller supplies one.
 *
 * The `basePath` constructor parameter selects the API surface — defaults to
 * `EPAYMENT_BASE_PATH` (`/epayment/v1`) but can be set to `RECURRING_BASE_PATH`
 * (`/recurring/v3`) to reach the Recurring API using the same credentials.
 *
 * Docs: https://developer.vippsmobilepay.com/docs/APIs/epayment-api/api-guide/
 */

import { randomUUID } from 'node:crypto'
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import {
  EPAYMENT_BASE_PATH,
  SYSTEM_NAME,
  SYSTEM_VERSION,
} from './constants'
import { extraOf, hostFor } from './auth'

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

export class VippsMobilepayClient {
  private http: AxiosInstance

  constructor(credentials: Credentials, basePath: string = EPAYMENT_BASE_PATH) {
    const extra = extraOf(credentials)
    this.http = axios.create({
      baseURL: `${hostFor(extra.environment)}${basePath}`,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        'Ocp-Apim-Subscription-Key': extra.subscriptionKey,
        'Merchant-Serial-Number': extra.merchantSerialNumber,
        'Vipps-System-Name': SYSTEM_NAME,
        'Vipps-System-Version': SYSTEM_VERSION,
        'Vipps-System-Plugin-Name': SYSTEM_NAME,
        'Vipps-System-Plugin-Version': SYSTEM_VERSION,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => (await this.http.get<T>(path, { params })).data)
  }

  /** POST with an `Idempotency-Key` (minted per call unless supplied). */
  async post<T>(path: string, body?: unknown, idempotencyKey?: string): Promise<T> {
    const key = idempotencyKey ?? randomUUID()
    return withRetry(
      async () =>
        (await this.http.post<T>(path, body ?? {}, { headers: { 'Idempotency-Key': key } })).data,
    )
  }
}
