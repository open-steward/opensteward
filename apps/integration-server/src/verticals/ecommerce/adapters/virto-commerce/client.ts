/**
 * Virto Commerce Platform Manager REST API client.
 *
 * Verified against the live Swagger of the public demo instance
 * (https://virtostart-demo-admin.govirto.com/docs/index.html, fetched
 * 2026-09-13):
 *
 *  - Auth: static API key sent via the `api_key` request header
 *    (`VirtoCommerce.Platform/swagger.json` → `components.securitySchemes.
 *    api_key_header`: `{ type: apiKey, in: header, name: api_key }`).
 *  - Every module search endpoint (`POST .../search`) takes `skip`/`take`
 *    and returns `{ totalCount, items | results }` — see `./constants.ts`
 *    for which modules use which key.
 *  - Retries via the shared `withRetry` (429 only, exponential backoff).
 */
import axios, { type AxiosInstance } from 'axios'
import { withRetry } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

export interface SearchResult<T> {
  items: T[]
  totalCount: number
}

export class VirtoCommerceClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const apiKey = credentials.accessToken
    const platformUrl = credentials.extra?.['platformUrl'] as string | undefined

    if (!apiKey) {
      throw new Error('VirtoCommerceClient: credentials.accessToken (apiKey) is required')
    }
    if (!platformUrl) {
      throw new Error('VirtoCommerceClient: credentials.extra.platformUrl is required')
    }

    this.http = axios.create({
      baseURL: platformUrl,
      headers: {
        api_key: apiKey,
        Accept: 'application/json',
        'Content-Type': 'application/json',
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

  /** JSON Patch (RFC 6902) partial update — every module's `PATCH .../{id}`. */
  async patch<T = void>(path: string, ops: Array<{ op: string; path: string; value?: unknown }>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.patch<T>(path, ops, {
        headers: { 'Content-Type': 'application/json-patch+json' },
      })
      return data
    })
  }

  async delete<T = void>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.delete<T>(path, { params })
      return data
    })
  }

  /**
   * `POST` a `*SearchCriteria` body to a module search endpoint and read
   * back `{ totalCount, items | results }` (the key differs by module — see
   * `./constants.ts`).
   */
  async search<T>(
    path: string,
    criteria: Record<string, unknown>,
    resultKey: 'items' | 'results',
  ): Promise<SearchResult<T>> {
    const take = Math.min((criteria['take'] as number | undefined) ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const skip = (criteria['skip'] as number | undefined) ?? 0
    const body = { ...criteria, take, skip }
    const data = await this.post<Record<string, unknown>>(path, body)
    return {
      items: (data[resultKey] as T[] | undefined) ?? [],
      totalCount: (data['totalCount'] as number | undefined) ?? 0,
    }
  }
}
