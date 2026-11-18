/**
 * Stay AI REST API client.
 *
 * Features:
 *  - `x-api-key` header authentication using the static merchant API key.
 *  - Retries with exponential backoff on 429 and 5xx responses.
 *  - `listWithPage` helper for Stay AI's page-number pagination
 *    (`page` starting from 1, `pageSize` 5–100).
 *
 * Base URL: https://api.retextion.com/api/v2
 * Docs: https://docs.stay.ai/reference/query-orders
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { BASE_URL, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

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

export interface ListResult<T> {
  items: T[]
  /** Next page number to fetch, if more pages exist. */
  nextPage?: number
}

export class StayAiClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const apiKey = credentials.accessToken
    if (!apiKey) {
      throw new Error(
        'StayAiClient: credentials.accessToken (API key) is required. ' +
          'Generate one in the Stay AI merchant portal under Settings → API Keys.',
      )
    }
    this.http = axios.create({
      baseURL: BASE_URL,
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
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

  async delete(path: string): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(path)
    })
  }

  /**
   * Page-number pagination helper.
   *
   * Stay AI returns an array of items directly (not wrapped in a key). Pages
   * start from 1 and the API accepts `page` + `pageSize` query params.
   * A response shorter than `pageSize` signals the last page.
   */
  async listWithPage<T>(
    path: string,
    extraParams: Record<string, unknown> = {},
  ): Promise<ListResult<T>> {
    const pageSize = Math.min(
      (extraParams['pageSize'] as number | undefined) ??
        (extraParams['limit'] as number | undefined) ??
        DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    )
    const page = (extraParams['page'] as number | undefined) ?? 1

    const params: Record<string, unknown> = { ...extraParams }
    delete params['limit']
    params['pageSize'] = pageSize
    params['page'] = page

    const items = await this.get<T[]>(path, params)
    const result = Array.isArray(items) ? items : []
    const nextPage = result.length >= pageSize ? page + 1 : undefined

    return { items: result, nextPage }
  }
}
