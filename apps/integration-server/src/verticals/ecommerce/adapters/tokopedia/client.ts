/**
 * Tokopedia Open API HTTP client with Bearer token auth.
 *
 * Tokopedia uses a standard REST API with Bearer token authentication.
 * The client auto-injects the Authorization header and handles retries
 * with exponential backoff for 429 and 5xx responses.
 *
 * Path templates use `:fs_id` and `:order_id` placeholders that are
 * resolved at call time.
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { BASE_URL } from './constants'

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

export class TokopediaClient {
  private http: AxiosInstance
  private fsId: string

  constructor(credentials: Credentials) {
    const fsId = credentials.extra?.['fsId'] as string | undefined

    if (!fsId) {
      throw new Error(
        'TokopediaClient requires fsId in credentials.extra.',
      )
    }
    if (!credentials.accessToken) {
      throw new Error(
        'TokopediaClient requires credentials.accessToken — the auth middleware should ' +
          'have called refreshCredentials before instantiating the client.',
      )
    }

    this.fsId = fsId

    this.http = axios.create({
      baseURL: BASE_URL,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${credentials.accessToken}`,
      },
      timeout: 30_000,
    })
  }

  /**
   * Resolve path template placeholders like `:fs_id` and `:order_id`.
   */
  resolvePath(template: string, params?: Record<string, string>): string {
    let path = template.replace(':fs_id', this.fsId)
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        path = path.replace(`:${key}`, value)
      }
    }
    return path
  }

  async get<T>(pathTemplate: string, params?: Record<string, unknown>, pathParams?: Record<string, string>): Promise<T> {
    const path = this.resolvePath(pathTemplate, pathParams)
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, { params })
      return data
    })
  }

  async post<T>(pathTemplate: string, body?: unknown, pathParams?: Record<string, string>): Promise<T> {
    const path = this.resolvePath(pathTemplate, pathParams)
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body)
      return data
    })
  }

  async delete<T>(pathTemplate: string, body?: unknown, pathParams?: Record<string, string>): Promise<T> {
    const path = this.resolvePath(pathTemplate, pathParams)
    return withRetry(async () => {
      const { data } = await this.http.delete<T>(path, { data: body })
      return data
    })
  }
}
