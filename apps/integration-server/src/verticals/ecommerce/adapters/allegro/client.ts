/**
 * Allegro REST API HTTP client.
 *
 * Auth header is `Authorization: Bearer <accessToken>`.
 * All requests include `Accept: application/vnd.allegro.public.v1+json`.
 * Pagination uses `offset` + `limit` with `totalCount` in the response.
 * Retries follow exponential backoff on 429 and 5xx.
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { DEFAULT_ENVIRONMENT, ENVIRONMENTS } from './constants'

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const axiosErr = err as AxiosError
      const status = axiosErr.response?.status
      const retryable = status === 429 || (status != null && status >= 500 && status < 600)
      if (retryable && i < retries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

export class AllegroClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const environment =
      (credentials.extra?.['environment'] as string | undefined) ?? DEFAULT_ENVIRONMENT
    const envCfg = ENVIRONMENTS[environment]
    if (!envCfg) {
      throw new Error(
        `AllegroClient: unknown environment '${environment}'. Valid: ${Object.keys(ENVIRONMENTS).join(', ')}.`,
      )
    }
    if (!credentials.accessToken) {
      throw new Error(
        'AllegroClient: credentials.accessToken is required — the auth middleware should ' +
          'have called refreshCredentials before instantiating the client.',
      )
    }
    this.http = axios.create({
      baseURL: `https://${envCfg.apiHost}`,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        'Content-Type': 'application/vnd.allegro.public.v1+json',
        Accept: 'application/vnd.allegro.public.v1+json',
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

  async post<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body)
      return data
    })
  }

  async put<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.put<T>(path, body)
      return data
    })
  }

  async patch<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.patch<T>(path, body, {
        headers: {
          'Content-Type': 'application/vnd.allegro.public.v1+json',
        },
      })
      return data
    })
  }

  async delete(path: string, params?: Record<string, unknown>): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(path, { params })
    })
  }
}
