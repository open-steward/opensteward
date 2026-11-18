/**
 * Documenso v1 REST API client.
 *
 * Auth is a single API token passed VERBATIM in the `Authorization` header —
 * there is no `Bearer` prefix. Lists paginate with `page` (1-indexed) +
 * `perPage` and return a `{ <resource>: [...], totalPages }` wrapper.
 *
 * Self-hosted instances live on a customer domain; the base URL is read from
 * `credentials.extra.baseUrl` and falls back to the hosted default.
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { DEFAULT_BASE_URL } from './constants'

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

export class DocumensoClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const baseURL = String(credentials.extra?.['baseUrl'] ?? DEFAULT_BASE_URL)
    this.http = axios.create({
      baseURL,
      headers: {
        // Documenso expects the raw token — NOT `Bearer <token>`.
        Authorization: credentials.accessToken ?? '',
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
}
