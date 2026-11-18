/**
 * Skio Public REST API client.
 *
 * Features:
 *  - `Authorization: API <key>` header — Skio's case-sensitive token prefix.
 *  - Simple 429 / 5xx retry with exponential backoff via the shared helper.
 *  - `listWithCursor` helper that reads the `pageInfo` envelope returned by
 *    every Skio list endpoint:
 *
 *      {
 *        "data": [...],
 *        "pageInfo": {
 *          "hasNextPage": true,
 *          "startCursor": "xxx",
 *          "endCursor": "yyy"
 *        }
 *      }
 *
 *    Callers pass `after=endCursor` on the next request to advance the page.
 *
 * Docs: https://code.skio.com/rest-api/
 */

import axios, { type AxiosInstance } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { withRetry } from '@opensteward/shared'
import { BASE_URL, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

export interface SkioPageInfo {
  hasNextPage: boolean
  startCursor?: string
  endCursor?: string
}

export interface ListResult<T> {
  items: T[]
  pageInfo: SkioPageInfo
}

/** Envelope returned by every Skio list endpoint. */
interface SkioListEnvelope<T> {
  data: T[]
  pageInfo: SkioPageInfo
}

export class SkioClient {
  private http: AxiosInstance

  /**
   * @param credentials - must carry the Skio API key in `accessToken`.
   */
  constructor(credentials: Credentials) {
    const apiKey = credentials.accessToken
    if (!apiKey) {
      throw new Error('SkioClient: credentials.accessToken (API key) is required')
    }
    this.http = axios.create({
      baseURL: BASE_URL,
      headers: {
        // Skio requires the literal prefix "API " before the key (case-sensitive).
        Authorization: `API ${apiKey}`,
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

  /**
   * List helper for Skio's cursor-based pagination.
   *
   * @param path  - resource path relative to BASE_URL (e.g. `subscriptions`)
   * @param extra - additional query params such as `createdAtMin`, `id`, etc.
   */
  async listWithCursor<T>(
    path: string,
    extra: Record<string, unknown> = {},
  ): Promise<ListResult<T>> {
    const first = Math.min(
      (extra['first'] as number | undefined) ??
        (extra['limit'] as number | undefined) ??
        DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    )

    const params: Record<string, unknown> = { ...extra, first }
    // Remove synonyms we handled above.
    delete params['limit']

    const envelope = await withRetry(async () => {
      const { data } = await this.http.get<SkioListEnvelope<T>>(path, { params })
      return data
    })

    return {
      items: envelope.data ?? [],
      pageInfo: envelope.pageInfo ?? { hasNextPage: false },
    }
  }
}
