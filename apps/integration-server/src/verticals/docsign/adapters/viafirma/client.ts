/**
 * Viafirma Documents REST API client.
 *
 * Bearer-token auth + JSON. All resource paths nest under
 * `${baseUrl}/documents/api/v3/...`. The host is resolved from
 * `credentials.extra.baseUrl` (private installs) and falls back to the
 * public sandbox host.
 *
 * Viafirma Documents has no list/search endpoint for SETs, so there is no
 * cursor/page pagination on the read surface — resources are addressed by
 * their `code`. Form-encoded helpers exist for the reject endpoint, which
 * Viafirma accepts as `application/x-www-form-urlencoded`.
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_PATH_PREFIX, DEFAULT_BASE_URL } from './constants'

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

export class ViafirmaClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const baseUrl = String(credentials.extra?.['baseUrl'] ?? DEFAULT_BASE_URL)
    this.http = axios.create({
      baseURL: `${baseUrl}${API_PATH_PREFIX}`,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
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

  /** Form-encoded POST/PUT — Viafirma's mutating endpoints take form bodies. */
  async putForm<T>(path: string, body: Record<string, string>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.put<T>(path, new URLSearchParams(body).toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
      return data
    })
  }
}
