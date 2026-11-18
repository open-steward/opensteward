/**
 * Unzer Payment API client — thin axios wrapper.
 *
 * Auth: HTTP Basic. The credential carries a pre-encoded token in
 * `accessToken` (base64 of `"<privateKey>:"`), sent as
 * `Authorization: Basic <token>`. The host is resolved from the key prefix at
 * credential-exchange time and stored on `credentials.extra.baseUrl`.
 *
 * Bodies and responses are JSON. Unzer's REST resources are addressed by id
 * (`s-cst-…`, `s-chg-…`, `s-pay-…`) rather than offset/limit list endpoints, so
 * the client only needs single-resource GET/POST/PUT/DELETE — there is no
 * page-based list pagination to model here.
 *
 * Docs: https://docs.unzer.com/server-side-integration/api-basics/
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { DEFAULT_BASE_URL } from './constants'

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
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

export class UnzerClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const baseURL = (credentials.extra?.baseUrl as string | undefined) ?? DEFAULT_BASE_URL
    this.http = axios.create({
      baseURL,
      headers: {
        Authorization: `Basic ${credentials.accessToken}`,
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

  async put<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => (await this.http.put<T>(path, body)).data)
  }

  async delete<T>(path: string): Promise<T> {
    return withRetry(async () => (await this.http.delete<T>(path)).data)
  }
}
