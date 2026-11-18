/**
 * Sertifi REST API client.
 *
 * apiKey auth: the portal API code is sent on every request via the
 * `sertifi-api-code` header. JSON in / JSON out. All resource paths nest
 * under `${baseUrl}/${API_VERSION}/...` where `baseUrl` defaults to
 * production and can be flipped to sandbox via `credentials.extra.sandbox`.
 *
 * Sertifi has no top-level list/collection endpoint for folders, so there
 * is no cursor/page pagination to thread — sub-resources (participants,
 * documents) are returned inline on the folder or as small bounded arrays.
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL, API_CODE_HEADER, API_VERSION, SANDBOX_BASE_URL } from './constants'

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

export class SertifiClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const sandbox = credentials.extra?.['sandbox'] === true
    const baseUrl = sandbox ? SANDBOX_BASE_URL : API_BASE_URL
    this.http = axios.create({
      baseURL: `${baseUrl}/${API_VERSION}`,
      headers: {
        [API_CODE_HEADER]: credentials.accessToken,
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

  async patch<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.patch<T>(path, body, {
        headers: { 'Content-Type': 'application/json' },
      })
      return data
    })
  }

  async delete<T>(path: string): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.delete<T>(path)
      return data
    })
  }
}
