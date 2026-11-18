/**
 * Square API client.
 *
 * Features:
 *  - Bearer token + Square-Version header on every request.
 *  - `listWithCursor` helper for cursor-based pagination.
 *  - 429/5xx retry with exponential backoff.
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import {
  ENVIRONMENTS,
  SQUARE_VERSION,
  DEFAULT_PAGE_SIZE,
  type SquareEnvironment,
} from './constants'

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const axiosErr = err as AxiosError
      const status = axiosErr.response?.status
      if ((status === 429 || (status != null && status >= 500)) && i < retries) {
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
  nextCursor?: string
}

export class SquareClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const env = (credentials.extra?.['environment'] as SquareEnvironment) ?? 'production'
    const version = (credentials.extra?.['squareVersion'] as string) ?? SQUARE_VERSION
    const baseURL = ENVIRONMENTS[env] ?? ENVIRONMENTS.production
    this.http = axios.create({
      baseURL,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        'Square-Version': version,
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
   * One page of a GET list endpoint that pages by `cursor`.
   *
   * Square places results in a response key (e.g. `{ customers: [...], cursor: "..." }`).
   * The caller specifies the key via `resourceKey`, and sends `limit` already
   * capped at that endpoint's ceiling (`PAGE_MAX`), because the ceilings
   * differ per endpoint. A missing or empty `cursor` in the response ends the
   * collection.
   */
  async listWithCursor<T>(
    path: string,
    resourceKey: string,
    params: { limit: number; cursor?: string } & Record<string, unknown>,
  ): Promise<ListResult<T>> {
    const query: Record<string, unknown> = { ...params }
    if (query['cursor'] === undefined) delete query['cursor']
    const res = await this.get<Record<string, unknown>>(path, query)
    const items = (res[resourceKey] ?? []) as T[]
    const cursor = res['cursor'] as string | undefined
    return { items, nextCursor: cursor || undefined }
  }

  /**
   * One page of a POST search endpoint that pages by `cursor` (Catalog,
   * Orders, Inventory counts). `body` is the original query, which every
   * page must repeat; `limit` is sent as given, capped by the caller at the
   * endpoint's ceiling (`PAGE_MAX`).
   */
  async searchWithCursor<T>(
    path: string,
    resourceKey: string,
    body: Record<string, unknown>,
    limit: number = DEFAULT_PAGE_SIZE,
    cursor?: string,
  ): Promise<ListResult<T>> {
    const payload: Record<string, unknown> = { ...body, limit }
    if (cursor !== undefined) payload['cursor'] = cursor
    const res = await this.post<Record<string, unknown>>(path, payload)
    const items = (res[resourceKey] ?? []) as T[]
    const next = res['cursor'] as string | undefined
    return { items, nextCursor: next || undefined }
  }
}
