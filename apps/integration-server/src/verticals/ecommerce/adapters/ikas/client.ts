/**
 * ikas GraphQL API client.
 *
 * Features:
 *  - `Authorization: Bearer <token>` header.
 *  - GraphQL POST requests to the v2 admin endpoint.
 *  - Page-based pagination helper (`listWithPage`) matching ikas's
 *    `PaginationInput { page, limit }` / response `{ data, count, hasNext }`.
 *  - Simple 429 / 5xx retry with exponential backoff.
 *
 * Docs: https://ikas.dev/docs/api/getting-started/making-request
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { GRAPHQL_ENDPOINT, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

// ── Retry helper ─────────────────────────────────────────────────────────────

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

// ── Pagination types ─────────────────────────────────────────────────────────

export interface PaginationInput {
  page: number
  limit: number
}

/** Shape returned by ikas list queries: `{ data: T[], count: number, hasNext: boolean }` */
export interface IkasPaginationResponse<T> {
  data: T[]
  count: number
  hasNext: boolean
  page?: number
  limit?: number
}

export interface ListResult<T> {
  items: T[]
  /** Next page number, or undefined if this is the last page. */
  nextPage?: number
}

// ── GraphQL response wrapper ─────────────────────────────────────────────────

interface GqlResponse<T> {
  data?: T
  errors?: Array<{ message: string }>
}

// ── Client ───────────────────────────────────────────────────────────────────

export class IkasClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: GRAPHQL_ENDPOINT,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  /**
   * Execute an arbitrary GraphQL operation and return the unwrapped `data`
   * payload. Throws if GraphQL errors are returned.
   */
  async gql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data: res } = await this.http.post<GqlResponse<T>>('', {
        query,
        variables: variables ?? {},
      })
      if (res.errors && res.errors.length > 0) {
        throw new Error(`ikas GraphQL error: ${res.errors.map((e) => e.message).join('; ')}`)
      }
      if (res.data == null) {
        throw new Error('ikas GraphQL response contained no data')
      }
      return res.data
    })
  }

  /**
   * Helper for list queries that follow ikas's `PaginationInput` / paginated
   * response pattern. Provide the query document string and the top-level
   * field name that holds the paginated result.
   */
  async listWithPage<T>(
    query: string,
    field: string,
    pagination: PaginationInput,
    extraVariables: Record<string, unknown> = {},
  ): Promise<ListResult<T>> {
    const page = pagination.page
    const limit = Math.min(pagination.limit, MAX_PAGE_SIZE)
    const variables = { ...extraVariables, pagination: { page, limit } }

    const res = await this.gql<Record<string, IkasPaginationResponse<T>>>(query, variables)
    const paginatedResult = res[field]

    if (!paginatedResult) {
      throw new Error(`ikas: expected field '${field}' in GraphQL response`)
    }

    return {
      items: paginatedResult.data ?? [],
      nextPage: paginatedResult.hasNext ? page + 1 : undefined,
    }
  }

  /**
   * Execute a GraphQL mutation and return the named mutation field from the
   * response.
   */
  async mutate<T>(query: string, field: string, variables?: Record<string, unknown>): Promise<T> {
    const res = await this.gql<Record<string, T>>(query, variables)
    const result = res[field]
    if (result == null) {
      throw new Error(`ikas mutation: expected field '${field}' in GraphQL response`)
    }
    return result
  }
}

// ── Default pagination helper ─────────────────────────────────────────────────

export function defaultPagination(params: {
  limit?: number
  page?: number
}): PaginationInput {
  return {
    page: (params.page as number | undefined) ?? 1,
    limit: Math.min((params.limit as number | undefined) ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
  }
}
