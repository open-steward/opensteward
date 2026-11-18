/**
 * Legalesign v1 REST API client.
 *
 * Auth is a single header: `Authorization: ApiKey <username>:<secret>`. The
 * joined `username:secret` string lives verbatim on `credentials.accessToken`
 * and is emitted unmodified after the `ApiKey ` prefix.
 *
 * The hosted region (US vs EU) is stored on `credentials.extra.region` and
 * selects the base URL.
 *
 * Lists paginate with `offset` (0-indexed) + `limit` and return a Tastypie
 * `{ meta: { limit, offset, total_count, next, previous }, objects: [...] }`
 * wrapper.
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { baseUrlForRegion } from './constants'

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const axiosErr = err as AxiosError
      const status = axiosErr.response?.status
      if ((status === 429 || (status !== undefined && status >= 500 && status < 600)) && i < retries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

export class LegalesignClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const baseURL = baseUrlForRegion(credentials.extra?.['region'] as string | undefined)
    this.http = axios.create({
      baseURL,
      headers: {
        Authorization: `ApiKey ${credentials.accessToken ?? ''}`,
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, { params })
      return data
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

  async delete<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.delete<T>(path, { params })
      return data
    })
  }
}
