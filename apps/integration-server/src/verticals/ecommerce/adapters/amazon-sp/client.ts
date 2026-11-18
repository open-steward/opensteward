/**
 * Amazon Selling Partner API (SP-API) HTTP client.
 *
 * Key differences from Shopify/WooCommerce clients:
 *
 *  - Auth header is `x-amz-access-token: <lwa-token>` (NOT `Authorization: Bearer`).
 *  - AWS SigV4 signing is NOT required — Amazon deprecated role-based
 *    signing in October 2023, so the LWA access token alone authenticates.
 *  - Pagination uses an opaque `NextToken` string rather than page numbers
 *    or `Link` headers. Response envelopes sometimes place it on a
 *    `pagination.nextToken` object and sometimes at the top level — the
 *    `listWithToken` helper checks both.
 *  - Retries follow the same exponential backoff as the Shopify client on
 *    HTTP 429 and 5xx. SP-API does not send `Retry-After`, only
 *    `x-amzn-RateLimit-Limit` / `x-amzn-RateLimit-Remaining`, so we
 *    ignore those and rely on deterministic backoff.
 */

import axios, { type AxiosInstance, type AxiosError, type AxiosResponse } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { DEFAULT_PAGE_SIZE, DEFAULT_REGION, REGIONS } from './constants'

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
  nextCursor?: string
}

/** Minimal shape for the pagination envelope used by many SP-API namespaces. */
interface MaybePaginated<T> {
  payload?: { [k: string]: unknown }
  pagination?: { nextToken?: string }
  NextToken?: string
  items?: T[]
}

export class AmazonSPClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const region =
      (credentials.extra?.['region'] as string | undefined) ?? DEFAULT_REGION
    const regionCfg = REGIONS[region]
    if (!regionCfg) {
      throw new Error(
        `AmazonSPClient: unknown region '${region}'. Valid regions: ${Object.keys(REGIONS).join(', ')}.`,
      )
    }
    if (!credentials.accessToken) {
      throw new Error(
        'AmazonSPClient: credentials.accessToken is required — the auth middleware should ' +
          'have called refreshCredentials before instantiating the client.',
      )
    }
    this.http = axios.create({
      baseURL: `https://${regionCfg.apiHost}`,
      headers: {
        'x-amz-access-token': credentials.accessToken,
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

  async getRaw<T>(
    path: string,
    params?: Record<string, unknown>,
  ): Promise<AxiosResponse<T>> {
    return withRetry(async () => {
      return await this.http.get<T>(path, { params })
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
      const { data } = await this.http.patch<T>(path, body)
      return data
    })
  }

  async delete(path: string, params?: Record<string, unknown>): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(path, { params })
    })
  }

  /**
   * List helper that follows SP-API's opaque `NextToken` pagination.
   *
   * SP-API endpoints vary in how they return the next cursor:
   *   - Orders: `payload: { Orders: [...], NextToken: '...' }`
   *   - Finances: `payload: { FinancialEvents: {...}, NextToken: '...' }`
   *   - Inventory: `payload: { inventorySummaries: [...] }, pagination: { nextToken }`
   *   - Listings: `items: [...]` with `pagination.nextToken`
   *
   * The caller passes `resourceKey` — the payload key holding the array
   * — and this helper normalises the envelope.
   */
  async listWithToken<T>(
    path: string,
    resourceKey: string,
    extraParams: Record<string, unknown> = {},
  ): Promise<ListResult<T>> {
    const params: Record<string, unknown> = {
      ...extraParams,
      MaxResultsPerPage:
        (extraParams['MaxResultsPerPage'] as number | undefined) ??
        (extraParams['pageSize'] as number | undefined) ??
        DEFAULT_PAGE_SIZE,
    }
    // Normalise caller-side `cursor` to Amazon's `NextToken`.
    if (params['cursor'] != null) {
      params['NextToken'] = params['cursor']
      delete params['cursor']
    }
    // Listings Items uses `pageToken` instead of `NextToken`.
    if (params['pageToken'] == null && params['NextToken'] != null && path.startsWith('/listings/')) {
      params['pageToken'] = params['NextToken']
      delete params['NextToken']
    }

    const { data } = await this.http.get<MaybePaginated<T> & Record<string, unknown>>(path, {
      params,
    })

    // Locate the items array. Check top-level `items`, then `payload[resourceKey]`,
    // then `data[resourceKey]`.
    let items: T[] = []
    if (Array.isArray((data as { items?: T[] }).items)) {
      items = (data as { items: T[] }).items
    } else if (
      data.payload &&
      typeof data.payload === 'object' &&
      Array.isArray((data.payload as Record<string, unknown>)[resourceKey])
    ) {
      items = (data.payload as Record<string, unknown>)[resourceKey] as T[]
    } else if (Array.isArray((data as Record<string, unknown>)[resourceKey])) {
      items = (data as Record<string, unknown>)[resourceKey] as T[]
    }

    // Locate the next cursor token. Prefer `pagination.nextToken`, fall back
    // to a top-level `NextToken` or `payload.NextToken`.
    let nextCursor: string | undefined
    if (data.pagination?.nextToken) {
      nextCursor = data.pagination.nextToken
    } else if (typeof data.NextToken === 'string') {
      nextCursor = data.NextToken
    } else if (
      data.payload &&
      typeof data.payload === 'object' &&
      typeof (data.payload as Record<string, unknown>)['NextToken'] === 'string'
    ) {
      nextCursor = (data.payload as Record<string, unknown>)['NextToken'] as string
    }

    return { items, nextCursor }
  }
}
