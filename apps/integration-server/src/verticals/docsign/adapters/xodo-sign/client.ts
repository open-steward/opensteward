/**
 * Xodo Sign (formerly eversign) REST API client.
 *
 * Auth is by query parameter, not header: every request carries
 * `access_key` (the API key, stored on `credentials.accessToken`) and
 * `business_id` (resolved at credential-exchange time onto
 * `credentials.extra.businessId`). Responses are JSON; list endpoints
 * return a bare JSON array and paginate via the `page` parameter
 * (1-indexed, up to 500 items per page).
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL } from './constants'

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

export class XodoSignClient {
  private http: AxiosInstance
  private accessKey: string
  private businessId: string

  constructor(credentials: Credentials) {
    this.accessKey = String(credentials.accessToken ?? '')
    this.businessId = String(credentials.extra?.['businessId'] ?? '')
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: { Accept: 'application/json' },
      timeout: 30_000,
    })
  }

  /** Merge the auth + business-scope query params into every request. */
  private scoped(params?: Record<string, unknown>): Record<string, unknown> {
    return {
      access_key: this.accessKey,
      ...(this.businessId ? { business_id: this.businessId } : {}),
      ...params,
    }
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(`/${path}`, { params: this.scoped(params) })
      return data
    })
  }

  async post<T>(
    path: string,
    body?: Record<string, unknown>,
    params?: Record<string, unknown>,
  ): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(`/${path}`, body, {
        params: this.scoped(params),
        headers: { 'Content-Type': 'application/json' },
      })
      return data
    })
  }

  async delete<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.delete<T>(`/${path}`, { params: this.scoped(params) })
      return data
    })
  }
}
