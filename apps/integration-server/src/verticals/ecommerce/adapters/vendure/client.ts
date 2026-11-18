/**
 * Vendure GraphQL client.
 *
 * Plain axios-based client -- no graphql-request or urql dependency.
 *
 * Features:
 *  - `query<T>(gql, vars?)` -- POST a GraphQL query, throw on errors.
 *  - `mutate<T>(gql, vars?)` -- POST a mutation, throw on top-level errors.
 *  - `listOffsetPage<T>(gql, dataKey, params)` -- one caller page by skip/take.
 *  - 429 / 5xx retry with exponential backoff.
 *  - Sets `vendure-token` header for channel scoping on every request.
 */

import axios, { type AxiosError } from 'axios'
import {
  pageOffset,
  reportUpstreamPage,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

// -- Retry helper ------------------------------------------------------------

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

// -- GraphQL error types -----------------------------------------------------

interface GqlError {
  message: string
  locations?: Array<{ line: number; column: number }>
  path?: string[]
  extensions?: Record<string, unknown>
}

interface GqlResponse<T> {
  data?: T
  errors?: GqlError[]
}

// -- Vendure list response shape ---------------------------------------------

export interface VendureList<T> {
  items: T[]
  totalItems: number
}

// -- Client ------------------------------------------------------------------

export class VendureClient {
  private apiUrl: string
  private token: string
  private channelToken: string

  constructor(credentials: Credentials) {
    const extra = (credentials.extra ?? {}) as Record<string, string>
    this.apiUrl = extra['apiUrl'] ?? ''
    this.token = credentials.accessToken
    this.channelToken = extra['channelToken'] ?? ''
    if (!this.apiUrl) {
      throw new Error('Vendure credentials must include extra.apiUrl')
    }
  }

  /**
   * Execute a GraphQL query and return `data`.
   * Throws if the response contains top-level `errors`.
   */
  async query<T>(gql: string, variables?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      }
      if (this.channelToken) {
        headers['vendure-token'] = this.channelToken
      }

      const { data: res } = await axios.post<GqlResponse<T>>(
        this.apiUrl,
        { query: gql, variables },
        { headers, timeout: 30_000 },
      )

      if (res.errors && res.errors.length > 0) {
        throw new Error(`Vendure GraphQL error: ${res.errors.map((e) => e.message).join('; ')}`)
      }
      return res.data as T
    })
  }

  /**
   * Execute a GraphQL mutation and return `data`.
   * Vendure mutations return result fields directly (not wrapped in an
   * `errors` field like Saleor). Only top-level GraphQL errors are checked.
   */
  async mutate<T>(gql: string, variables?: Record<string, unknown>): Promise<T> {
    const data = await this.query<T>(gql, variables)

    // Check for Vendure ErrorResult types: mutations may return union types
    // where error results have a `message` and `errorCode` field.
    if (data && typeof data === 'object') {
      for (const value of Object.values(data as Record<string, unknown>)) {
        if (value && typeof value === 'object') {
          const obj = value as Record<string, unknown>
          if ('errorCode' in obj && 'message' in obj) {
            throw new Error(
              `Vendure mutation error: ${String(obj['errorCode'])}: ${String(obj['message'])}`,
            )
          }
        }
      }
    }

    return data
  }

  /**
   * Fetch ONE caller page of a Vendure list query.
   *
   * Vendure's `*ListOptions` inputs page by `skip` ("Skips the first n
   * results") and `take` ("Takes n results"), and every `PaginatedList`
   * answers `{ items, totalItems }`. So page `k` of size `take` is
   * `skip = (k - 1) × take`, and there is more when
   * `skip + items.length < totalItems`.
   *
   * `take` is the caller's limit, clamped to the Admin API's
   * `adminListQueryLimit` (default 1000), past which Vendure refuses the
   * query. A clamped request is reported as its real `pageSize` and strides
   * by it, so no rows fall between pages.
   *
   * @param gql     GraphQL query string (must accept `$options` with skip/take)
   * @param dataKey Top-level field name in the data object (e.g. `'products'`)
   * @param params  The caller's list params (`page`, `limit`)
   */
  async listOffsetPage<T>(gql: string, dataKey: string, params: QueryParams): Promise<T[]> {
    const asked = params.limit ?? DEFAULT_PAGE_SIZE
    const take = Math.min(asked, MAX_PAGE_SIZE)
    const skip = pageOffset(params, take)
    const data = await this.query<Record<string, VendureList<T> | undefined>>(gql, {
      options: { skip, take },
    })
    const list = data?.[dataKey]
    const items = list?.items ?? []
    const totalItems = list?.totalItems
    reportUpstreamPage(params, {
      ...(typeof totalItems === 'number'
        ? { totalCount: totalItems, hasMore: skip + items.length < totalItems }
        : {}),
      ...(take < asked ? { pageSize: take } : {}),
    })
    return items
  }
}
