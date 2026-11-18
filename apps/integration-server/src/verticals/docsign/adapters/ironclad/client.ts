/**
 * Ironclad CLM Public API client.
 *
 * Bearer-token auth + JSON. The host is region-scoped (na1 / eu1 / demo),
 * resolved from `credentials.extra.region` and validated to stay on
 * ironcladapp.com. Lists are page/pageSize paginated and wrap results in
 * `{ page, pageSize, count, list }`.
 *
 * Client-credentials tokens require an `x-as-user-email` (or `x-as-user-id`)
 * header to set the acting user; for authorization-code tokens the acting
 * user is the authorizing user, so the header is only sent when one of those
 * values is present on `credentials.extra`.
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { connectionIroncladRegion } from './auth'
import { API_BASE_PATH, regionHost } from './constants'

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

export class IroncladClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const region = connectionIroncladRegion(credentials)
    const asUserEmail = credentials.extra?.['asUserEmail']
    const asUserId = credentials.extra?.['asUserId']
    const headers: Record<string, string> = {
      Authorization: `Bearer ${credentials.accessToken}`,
      Accept: 'application/json',
    }
    if (asUserEmail) headers['x-as-user-email'] = String(asUserEmail)
    else if (asUserId) headers['x-as-user-id'] = String(asUserId)

    this.http = axios.create({
      baseURL: `${regionHost(region)}${API_BASE_PATH}`,
      headers,
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

  async patch<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.patch<T>(path, body, {
        headers: { 'Content-Type': 'application/json' },
      })
      return data
    })
  }
}
