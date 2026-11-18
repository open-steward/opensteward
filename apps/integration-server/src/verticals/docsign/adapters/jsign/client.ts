/**
 * jSign REST API client.
 *
 * Auth: `Authorization: Bearer <token>` plus the required
 * `app_auth_type: jsign-oauth2` header on every request. JSON in/out.
 * List endpoints use page/page_size pagination.
 *
 * Swagger/OpenAPI spec: https://api.jsign.com/swagger/v2/swagger.json
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL, APP_AUTH_TYPE_HEADER, APP_AUTH_TYPE_VALUE } from './constants'

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

export class JsignClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        Authorization: `Bearer ${credentials.accessToken ?? ''}`,
        [APP_AUTH_TYPE_HEADER]: APP_AUTH_TYPE_VALUE,
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
      const { data } = await this.http.post<T>(path, body ?? {}, {
        headers: { 'Content-Type': 'application/json; x-api-version=2.0' },
      })
      return data
    })
  }

  async put<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.put<T>(path, body ?? {}, {
        headers: { 'Content-Type': 'application/json; x-api-version=2.0' },
      })
      return data
    })
  }
}
