/**
 * Lightspeed Retail (R-Series) API client.
 *
 * Features:
 *  - Bearer token on every request.
 *  - accountID injected into the base URL path.
 *  - `listWithOffset` helper for offset/limit pagination.
 *  - 429/5xx/401 retry with exponential backoff. 401 triggers one
 *    automatic token refresh before failing (R-Series tokens expire
 *    every ~30 minutes).
 *  - Response envelope unwrapping: R-Series wraps responses in a key
 *    matching the resource name (e.g. `{ "Item": {...} }`).
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { BASE_URL, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { refreshAccessToken } from './auth'

async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 4,
  onRefresh?: () => Promise<void>,
): Promise<T> {
  let refreshed = false
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const axiosErr = err as AxiosError
      const status = axiosErr.response?.status

      // On 401, attempt one refresh before retrying
      if (status === 401 && !refreshed && onRefresh) {
        refreshed = true
        await onRefresh()
        continue
      }

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
  nextOffset?: number
  total?: number
}

export class LightspeedRetailClient {
  private http: AxiosInstance
  private credentials: Credentials
  private accountId: string

  constructor(credentials: Credentials) {
    const accountId = credentials.extra?.['accountId'] as string | undefined
    if (!accountId) {
      throw new Error('Lightspeed Retail requires accountId in credentials.extra')
    }
    this.accountId = accountId
    this.credentials = credentials
    this.http = this.createHttp(credentials.accessToken)
  }

  private createHttp(accessToken: string): AxiosInstance {
    return axios.create({
      baseURL: `${BASE_URL}/${this.accountId}/`,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  private async handleRefresh(): Promise<void> {
    const refreshed = await refreshAccessToken(this.credentials)
    this.credentials = { ...this.credentials, ...refreshed }
    this.http = this.createHttp(refreshed.accessToken)
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(
      async () => {
        const { data } = await this.http.get<T>(path, { params })
        return data
      },
      4,
      () => this.handleRefresh(),
    )
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(
      async () => {
        const { data } = await this.http.post<T>(path, body)
        return data
      },
      4,
      () => this.handleRefresh(),
    )
  }

  async put<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(
      async () => {
        const { data } = await this.http.put<T>(path, body)
        return data
      },
      4,
      () => this.handleRefresh(),
    )
  }

  async delete(path: string): Promise<void> {
    return withRetry(
      async () => {
        await this.http.delete(path)
      },
      4,
      () => this.handleRefresh(),
    )
  }

  /**
   * Generic list helper for R-Series endpoints that use offset/limit pagination.
   *
   * R-Series wraps responses like `{ "Item": [...], "@attributes": { "count": "42", "offset": "0", "limit": "100" } }`.
   * The caller specifies the resource key (e.g. `"Item"`).
   */
  async listWithOffset<T>(
    path: string,
    resourceKey: string,
    extraParams: Record<string, unknown> = {},
  ): Promise<ListResult<T>> {
    const limit = Math.min(
      (extraParams['limit'] as number) ?? DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    )
    const offset = (extraParams['offset'] as number) ?? 0

    const params: Record<string, unknown> = {
      ...extraParams,
      limit,
      offset,
    }

    const res = await this.get<Record<string, unknown>>(path, params)
    const attrs = res['@attributes'] as Record<string, string> | undefined
    const total = attrs?.['count'] ? parseInt(attrs['count'], 10) : undefined

    // R-Series may return a single object instead of an array for single results
    const raw = res[resourceKey]
    let items: T[]
    if (Array.isArray(raw)) {
      items = raw as T[]
    } else if (raw != null && typeof raw === 'object') {
      items = [raw as T]
    } else {
      items = []
    }

    const nextOffset = total != null && offset + limit < total ? offset + limit : undefined
    return { items, nextOffset, total }
  }

  /**
   * One page of a V3 query endpoint, which pages by opaque cursor only (the
   * 2022.04.11 changelog removed `offset`).
   *
   * Page 1 is `GET path?…query`. Every later page is the `@attributes.next`
   * URL of the page before it, requested exactly as given: "Always use the
   * URLs as provided in the next/previous keys." It already carries every
   * query parameter of the first request plus `after`. On the last page
   * `next` is an empty string, returned here as `undefined`.
   * (https://developers.lightspeedhq.com/retail/introduction/pagination/)
   *
   * A next URL on any origin other than the API's is refused rather than
   * requested, because the request carries the bearer token.
   */
  async listCursorPage<T>(
    pathOrNextUrl: string,
    resourceKey: string,
    query?: Record<string, unknown>,
  ): Promise<{ items: T[]; next?: string }> {
    const isNext = /^https?:\/\//i.test(pathOrNextUrl)
    if (isNext && new URL(pathOrNextUrl).origin !== new URL(BASE_URL).origin) {
      throw new Error('Lightspeed Retail returned a next page URL outside the API origin')
    }
    const res = await this.get<Record<string, unknown>>(
      pathOrNextUrl,
      isNext ? undefined : query,
    )
    const attrs = res['@attributes'] as Record<string, unknown> | undefined
    const next = typeof attrs?.['next'] === 'string' && attrs['next'] !== '' ? attrs['next'] : undefined

    // R-Series may return a single object instead of an array for single results
    const raw = res[resourceKey]
    const items: T[] = Array.isArray(raw)
      ? (raw as T[])
      : raw != null && typeof raw === 'object'
        ? [raw as T]
        : []
    return { items, next }
  }
}
