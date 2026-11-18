/**
 * Jotform REST API client.
 *
 * Auth: `APIKEY: <apiKey>` header. JSON out. List endpoints page with
 * `offset` (row offset, 0-indexed) + `limit`. Every response is wrapped in a
 * `{ responseCode, message, content, resultSet, limit-left }` envelope — the
 * client unwraps `content` so callers work directly with the payload.
 *
 * The per-account region host is resolved from `credentials.extra.baseUrl`
 * (set at credential exchange), defaulting to the US host.
 *
 * Docs: https://api.jotform.com/docs/
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL } from './constants'

/** Jotform's standard response envelope. `content` carries the real payload. */
export interface JotformEnvelope<T> {
  responseCode: number
  message?: string
  content: T
  duration?: string
  resultSet?: {
    offset?: number
    limit?: number
    count?: number
  }
  'limit-left'?: number
}

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

export class JotformSignClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const baseURL = String(credentials.extra?.['baseUrl'] ?? API_BASE_URL)
    this.http = axios.create({
      baseURL,
      headers: {
        APIKEY: credentials.accessToken,
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  /** GET an endpoint and return the unwrapped `content` payload. */
  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<JotformEnvelope<T>>(path, { params })
      return data.content
    })
  }
}
