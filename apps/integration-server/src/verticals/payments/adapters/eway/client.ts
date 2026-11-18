/**
 * eWAY Rapid API client — thin axios wrapper.
 *
 * Auth is HTTP Basic: `Authorization: Basic <base64(apiKey:password)>`, where
 * the encoded string is exactly what we store on `credentials.accessToken`.
 * Every request also carries `X-EWAY-APIVERSION` to pin the response shape.
 * Bodies and responses are JSON.
 *
 * Rapid has NO list-with-cursor endpoint for transactions or refunds: you
 * either create a transaction (`POST /Transaction`), query one by id
 * (`GET /Transaction/{id}` → `{ Transactions: [...] }`), refund one
 * (`POST /Transaction/{id}/Refund`), or fetch a token customer
 * (`GET /Customer/{tokenCustomerId}`). So this client only exposes `get` /
 * `post`; there is no pagination to implement.
 *
 * The base URL is environment-specific (sandbox vs production), resolved from
 * the environment the merchant selected at connect time.
 *
 * Docs: https://eway.io/api-v3/
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_VERSION, baseUrlFor } from './constants'

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const s = (err as AxiosError).response?.status
      if ((s === 429 || (s !== undefined && s >= 500 && s < 600)) && i < retries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

function environmentOf(credentials: Credentials): string {
  const env = credentials.extra?.['environment']
  return typeof env === 'string' ? env : 'sandbox'
}

export class EwayClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: baseUrlFor(environmentOf(credentials)),
      headers: {
        Authorization: `Basic ${credentials.accessToken}`,
        'X-EWAY-APIVERSION': API_VERSION,
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
